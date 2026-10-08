import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { fetchPlacements } from "./ads.ts";
import { createMemoryLedger, estimateTokens } from "./ledger.ts";
import { streamFlash, streamMock } from "./llm.ts";
import type { ChatMessage, GravityContext, HarnessId } from "./types.ts";

const port = Number(process.env.SUBSPACES_API_PORT || process.env.PORT || 41824);
const ledger = createMemoryLedger();

function flag(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

const mockLlm = flag("MOCK_LLM", !process.env.LLM_API_KEY);

const app = new Hono();
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["content-type"],
  }),
);

app.get("/api/health", (c) => c.json({ ok: true, product: "subspaces.si" }));

app.get("/api/config", (c) => {
  const pixelId = process.env.GRAVITY_PIXEL_ID || null;
  return c.json({
    product: "subspaces.si",
    mockLlm,
    gravity: Boolean(process.env.GRAVITY_API_KEY),
    gravityProduction: process.env.GRAVITY_PRODUCTION === "1",
    pixelId,
    modelLabel: process.env.LLM_MODEL || "GLM-5.3-Flash",
    softCap: 15_000_000,
  });
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
  const redirectUri =
    process.env.GITHUB_OAUTH_CALLBACK || `http://127.0.0.1:${port}/api/auth/github/callback`;
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

  const harness: HarnessId = body.harness === "stub" ? "stub" : "opencode";
  const sessionId = sessionOf(body.sessionId);
  const gate = ledger.consumeRequest(sessionId);
  if (!gate.ok) {
    return c.json({ error: gate.reason, retryAfterSec: gate.retryAfterSec }, 429);
  }

  const before = ledger.snapshot(sessionId);
  const userText = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const promptTokens = estimateTokens(messages.map((message) => message.content).join("\n"));
  const headerBag = headerRecord(c.req.raw.headers);

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

      const chunks =
        harness === "stub" || mockLlm
          ? streamMock(userText, harness, before.slowed)
          : streamFlash(systemMessages(messages, harness), before.slowed);

      for await (const chunk of chunks) {
        reply += chunk;
        await stream.writeSSE({ data: JSON.stringify({ type: "chunk", content: chunk }) });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The model proxy failed.";
      await stream.writeSSE({ data: JSON.stringify({ type: "error", message }) });
    }

    const usage = ledger.record(sessionId, promptTokens, estimateTokens(reply));
    const ads = await adPromise;
    await stream.writeSSE({
      data: JSON.stringify({
        type: "done",
        ad: ads.below,
        usage,
        harness,
        mockLlm: harness === "stub" || mockLlm,
      }),
    });
  });
});

function systemMessages(messages: ChatMessage[], harness: HarnessId): ChatMessage[] {
  const prompt =
    harness === "opencode"
      ? "You are the subspaces.si coding assistant on the opencode harness adapter. Be concise. Prefer a short code block when it answers the question. Do not mention other editor brands."
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
  return { sessionId: "sidebar", device: { ua } };
}

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  console.log(`subspaces proxy on http://127.0.0.1:${port} mockLlm=${mockLlm}`);
});
