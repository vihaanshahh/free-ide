import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { fetchPlacements } from "./ads.ts";
import { mockLlmEnabled } from "./env.ts";
import type { OpenCodeHarness } from "./harness.ts";
import { estimateTokens } from "./ledger.ts";
import { streamFlash, streamMock } from "./llm.ts";
import { handleChatCompletions, handleModels, withProviderSession, type ChatCompletionBody } from "./provider.ts";
import { ledger } from "./runtime.ts";
import type { ChatMessage, GravityContext, HarnessId } from "./types.ts";

let harness: OpenCodeHarness | null = null;

export function attachHarness(next: OpenCodeHarness | null): void {
  harness = next;
}

export function activeHarness(): OpenCodeHarness | null {
  return harness;
}

export const app = new Hono();
export default app;

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["content-type", "authorization", "x-subspaces-session"],
  }),
);

app.get("/api/health", (c) => c.json({ ok: true, product: "subspaces.si", harness: harness ? "opencode" : "off" }));

app.get("/api/config", (c) => {
  const pixelId = process.env.GRAVITY_PIXEL_ID || null;
  return c.json({
    product: "subspaces.si",
    mockLlm: mockLlmEnabled(),
    opencode: Boolean(harness),
    opencodeVersion: harness?.version ?? null,
    gravity: Boolean(process.env.GRAVITY_API_KEY),
    gravityProduction: process.env.GRAVITY_PRODUCTION === "1",
    pixelId,
    modelLabel: process.env.LLM_MODEL_LABEL || "GLM-5.3-Flash",
    fallbackModel: process.env.LLM_FALLBACK_MODEL || "deepseek-v4.1-flash",
    softCap: 15_000_000,
  });
});

app.get("/v1/models", () => handleModels());

app.post("/v1/chat/completions", async (c) => {
  const body = (await c.req.json().catch(() => null)) as ChatCompletionBody | null;
  if (!body || !Array.isArray(body.messages)) return c.json({ error: { message: "messages is required" } }, 400);
  const headerSession = c.req.header("x-subspaces-session");
  if (headerSession) {
    return withProviderSession(sessionOf(headerSession), () => handleChatCompletions(body));
  }
  return handleChatCompletions(body);
});

app.get("/api/auth/github", (c) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return c.json(
      {
        ok: false,
        provider: "github",
        status: "stub",
        message:
          "GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET on the server. This build does not create accounts.",
      },
      501,
    );
  }
  const redirectUri = process.env.GITHUB_OAUTH_CALLBACK || new URL("/api/auth/github/callback", c.req.url).toString();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("redirect_uri", redirectUri);
  return c.redirect(url.toString());
});

app.get("/api/auth/github/callback", (c) =>
  c.json(
    {
      ok: false,
      provider: "github",
      status: "stub",
      message: "OAuth callback is a placeholder. Token exchange is not implemented, and the code query is ignored.",
    },
    501,
  ),
);

app.get("/api/usage/:sessionId", (c) => {
  const sessionId = sessionOf(c.req.param("sessionId"));
  return c.json(ledger.snapshot(sessionId));
});

app.post("/api/chat/cancel", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { sessionId?: string } | null;
  const sessionId = sessionOf(body?.sessionId);
  await harness?.cancel(sessionId);
  return c.json({ ok: true });
});

app.get("/api/ads/sidebar", async (c) => {
  const headerBag = headerRecord(c.req.raw.headers);
  const { sidebar } = await fetchPlacements({
    messages: [{ role: "user", content: "Developer tools for reading API logs and pull requests." }],
    gravityContext: contextFrom(c.req.query("ua") || headerBag["user-agent"]),
    headers: headerBag,
  });
  return c.json({ ad: sidebar });
});

app.post("/api/chat", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    messages?: ChatMessage[];
    harness?: string;
    sessionId?: string;
    gravity_context?: GravityContext;
  } | null;

  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json({ error: "messages is required" }, 400);
  }

  const messages = body.messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant" || message.role === "system"))
    .slice(-30)
    .map((message) => ({
      role: message.role,
      content: String(message.content ?? "").slice(0, 20_000),
    }));

  const harnessId: HarnessId = body.harness === "stub" ? "stub" : "opencode";
  const active = harness;
  const ranHarness: HarnessId = harnessId === "opencode" && active ? "opencode" : "stub";
  const sessionId = sessionOf(body.sessionId);
  const gate = ledger.consumeRequest(sessionId);
  if (!gate.ok) {
    return c.json({ error: gate.reason, retryAfterSec: gate.retryAfterSec }, 429);
  }

  const before = ledger.snapshot(sessionId);
  const userText = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const promptTokens = estimateTokens(messages.map((message) => message.content).join("\n"));
  const headerBag = headerRecord(c.req.raw.headers);
  const mock = mockLlmEnabled();

  const adPromise = fetchPlacements({
    messages,
    gravityContext: body.gravity_context,
    headers: headerBag,
  });

  return streamSSE(c, async (stream) => {
    let reply = "";
    try {
      if (before.slowed) {
        const note = "Soft cap reached (15M tokens this session). Replies are slowed, not blocked.\n\n";
        reply += note;
        await stream.writeSSE({ data: JSON.stringify({ type: "chunk", content: note }) });
      }

      if (ranHarness === "opencode" && active) {
        const diff = await withProviderSession(sessionId, () =>
          active.runTurn({
            sessionKey: sessionId,
            text: userText,
            signal: c.req.raw.signal,
            onChunk: async (content) => {
              reply += content;
              await stream.writeSSE({ data: JSON.stringify({ type: "chunk", content }) });
            },
            onTool: async (line) => {
              const content = `\n${line}\n`;
              reply += content;
              await stream.writeSSE({ data: JSON.stringify({ type: "tool", content: line }) });
              await stream.writeSSE({ data: JSON.stringify({ type: "chunk", content }) });
            },
          }),
        );
        if (diff && !reply.includes(diff.slice(0, 40))) {
          const block = `\n\n${diff}`;
          reply += block;
          await stream.writeSSE({ data: JSON.stringify({ type: "chunk", content: block }) });
        }
      } else {
        const chunks = mock ? streamMock(userText, ranHarness, before.slowed) : streamFlash(systemMessages(messages, ranHarness), before.slowed);
        for await (const chunk of chunks) {
          reply += chunk;
          await stream.writeSSE({ data: JSON.stringify({ type: "chunk", content: chunk }) });
        }
        ledger.record(sessionId, promptTokens, estimateTokens(reply));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The model proxy failed.";
      await stream.writeSSE({ data: JSON.stringify({ type: "error", message }) });
    }

    const usage = ledger.snapshot(sessionId);
    const ads = await adPromise;
    await stream.writeSSE({
      data: JSON.stringify({
        type: "done",
        ad: ads.below,
        usage,
        harness: ranHarness,
        mockLlm: ranHarness === "stub" ? true : mock,
      }),
    });
  });
});

function systemMessages(messages: ChatMessage[], harnessId: HarnessId): ChatMessage[] {
  const prompt =
    harnessId === "opencode"
      ? "You are the subspaces.si coding assistant. Be concise. Do not mention other editor brands."
      : "You are a stub harness with no tools. Say that plainly, then stop.";
  return [{ role: "system", content: prompt }, ...messages];
}

function sessionOf(value: unknown): string {
  const raw = String(value ?? "local-demo");
  if (/^[a-zA-Z0-9_-]{4,80}$/.test(raw)) return raw;
  return "local-demo";
}

function headerRecord(headers: Headers): Record<string, string | undefined> {
  return {
    "user-agent": headers.get("user-agent") ?? undefined,
    "x-forwarded-for": headers.get("x-forwarded-for") ?? undefined,
  };
}

function contextFrom(ua: string | undefined): GravityContext {
  return { sessionId: "sidebar", user: { userId: "local-demo" }, device: { ua } };
}
