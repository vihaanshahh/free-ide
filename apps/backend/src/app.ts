import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { confirmGravityReward, fetchPlacements } from "./ads.ts";
import { AD_REWARD_TOKENS, FALLBACK_MODEL, GRAVITY_PIXEL_ID, MAX_OUTPUT_TOKENS, MAX_REQUEST_BYTES, PRIMARY_MODEL } from "./config.ts";
import { mockLlmEnabled, redactSecrets } from "./env.ts";
import {
  allowModelRequest,
  allowReward,
  allowSessionMint,
  clientAuthorized,
  clientIp,
  commitSessionUse,
  corsOrigin,
  isHostedRequest,
  issueSessionToken,
  originAllowed,
  redeemImpression,
  rewardCooldownOk,
  rotateSession,
  sessionFromHeaders,
  type SessionClaims,
} from "./guard.ts";
import type { OpenCodeHarness } from "./harness.ts";
import { estimateTokens } from "./ledger.ts";
import { DIRECT_CHAT_PROMPT, streamFlash, streamMock } from "./llm.ts";
import { handleChatCompletions, handleModels, withProviderSession, type ChatCompletionBody } from "./provider.ts";
import { ledger } from "./runtime.ts";
import type { ChatMessage, GravityContext, HarnessId } from "./types.ts";

/** Hobby plan ceiling. Streaming should finish inside this window. */
export const maxDuration = 60;

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
    origin: (origin) => corsOrigin(origin) || "",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["content-type", "authorization", "x-subspaces-session", "x-subspaces-client", "x-subspaces-token"],
    exposeHeaders: ["x-subspaces-token"],
  }),
);

app.get("/api/health", (c) => c.json({ ok: true, product: "subspaces.si", harness: harness ? "opencode" : "off" }));

app.get("/api/config", (c) => {
  return c.json({
    product: "subspaces.si",
    mockLlm: mockLlmEnabled(),
    opencode: Boolean(harness),
    opencodeVersion: harness?.version ?? null,
    gravity: Boolean(process.env.GRAVITY_API_KEY),
    gravityProduction: process.env.GRAVITY_PRODUCTION === "1",
    pixelId: GRAVITY_PIXEL_ID,
    modelLabel: "GLM-5.3-Flash",
    primaryModel: PRIMARY_MODEL,
    fallbackModel: FALLBACK_MODEL,
    adReward: AD_REWARD_TOKENS,
    softCap: 15_000_000,
  });
});

app.get("/api/session", (c) => {
  const ip = clientIp(c.req.raw.headers);
  if (!allowSessionMint(ip)) return c.json({ error: "too many requests" }, 429);
  const token = issueSessionToken();
  writeSession(c, token);
  return c.json({ token, balance: 0 });
});

app.get("/v1/models", () => handleModels());

app.post("/v1/chat/completions", async (c) => {
  const admission = gate(c.req.raw.headers, contentLength(c.req.raw.headers), c.req.url);
  if (isDenied(admission)) return c.json({ error: { message: admission.message } }, admission.status);
  const raw = await c.req.text();
  if (raw.length > MAX_REQUEST_BYTES) return c.json({ error: { message: "request is too large" } }, 413);
  let body: ChatCompletionBody | null = null;
  try {
    body = JSON.parse(raw || "null") as ChatCompletionBody | null;
  } catch {
    body = null;
  }
  if (!body || !Array.isArray(body.messages)) return c.json({ error: { message: "messages is required" } }, 400);
  const spent = spendLive(admission, estimateTokens(raw));
  if (isDenied(spent)) return c.json({ error: { message: spent.message } }, spent.status);
  const headerSession = c.req.header("x-subspaces-session");
  const response = headerSession
    ? await withProviderSession(sessionOf(headerSession), () => handleChatCompletions(body))
    : await handleChatCompletions(body);
  return withSession(c, response, spent.token);
});

app.post("/api/ads/reward", async (c) => {
  if (!originAllowed(c.req.header("origin") ?? undefined)) return c.json({ error: "origin is not allowed" }, 403);
  const ip = clientIp(c.req.raw.headers);
  if (!allowReward(ip)) return c.json({ error: "too many requests" }, 429);
  const session = sessionFromHeaders(c.req.raw.headers);
  if (!session) return c.json({ error: "missing client session" }, 401);
  const raw = await c.req.text();
  if (raw.length > MAX_REQUEST_BYTES) return c.json({ error: "request is too large" }, 413);
  if (raw.trim()) {
    try {
      JSON.parse(raw);
    } catch {
      return c.json({ error: "invalid reward request" }, 400);
    }
  }
  if (!rewardCooldownOk(session)) return c.json({ error: "too many requests", balance: session.bal }, 429);
  const proof = await confirmGravityReward({
    headers: headerRecord(c.req.raw.headers),
    remoteAddress: ip,
  });
  if (!proof.ok || !redeemImpression(proof.impressionId)) {
    return c.json({ error: "ad was not verified", balance: session.bal }, 402);
  }
  if (!commitSessionUse(session)) return c.json({ error: "missing client session" }, 401);
  const balance = session.bal + AD_REWARD_TOKENS;
  const token = rotateSession(session, { bal: balance, rew: Date.now() });
  writeSession(c, token);
  return c.json({ token, balance, ad: proof.ad });
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

app.get("/api/ads", async (c) => {
  const headerBag = headerRecord(c.req.raw.headers);
  const prompt = (c.req.query("q") || "Developer tools for pull requests and API logs.").slice(0, 500);
  const { below } = await fetchPlacements({
    messages: [{ role: "user", content: prompt }],
    gravityContext: contextFrom(headerBag["user-agent"]),
    headers: headerBag,
  });
  return c.json({ ad: below });
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
  const admission = gate(c.req.raw.headers, contentLength(c.req.raw.headers), c.req.url);
  if (isDenied(admission)) return c.json({ error: admission.message }, admission.status);
  const raw = await c.req.text();
  if (raw.length > MAX_REQUEST_BYTES) return c.json({ error: "request is too large" }, 413);
  const body = parseChat(raw);

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
  const ledgerGate = ledger.consumeRequest(sessionId);
  if (!ledgerGate.ok) {
    return c.json({ error: ledgerGate.reason, retryAfterSec: ledgerGate.retryAfterSec }, 429);
  }

  const before = ledger.snapshot(sessionId);
  const userText = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const promptTokens = estimateTokens(messages.map((message) => message.content).join("\n"));
  const spent = spendLive(admission, promptTokens);
  if (isDenied(spent)) return c.json({ error: spent.message }, spent.status);
  if (spent.token) writeSession(c, spent.token);
  const headerBag = headerRecord(c.req.raw.headers);
  const mock = mockLlmEnabled();

  const adPromise = fetchPlacements({
    messages,
    gravityContext: body.gravity_context,
    headers: headerBag,
  });

  c.header("cache-control", "no-cache, no-transform");
  c.header("x-accel-buffering", "no");
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
      } else if (mock) {
        const chunks = streamMock(userText, ranHarness, before.slowed);
        for await (const chunk of chunks) {
          reply += chunk;
          await stream.writeSSE({ data: JSON.stringify({ type: "chunk", content: chunk }) });
        }
        ledger.record(sessionId, promptTokens, estimateTokens(reply));
      } else {
        const chunks = streamFlash(directMessages(messages), before.slowed);
        for await (const chunk of chunks) {
          reply += chunk;
          await stream.writeSSE({ data: JSON.stringify({ type: "chunk", content: chunk }) });
        }
        ledger.record(sessionId, promptTokens, estimateTokens(reply));
      }
    } catch (error) {
      const message = redactSecrets(error instanceof Error ? error.message : "The model proxy failed.");
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
        mockLlm: mock,
        ...(spent.token ? { token: spent.token, balance: readBalance(spent.token) } : {}),
      }),
    });
  });
});

function directMessages(messages: ChatMessage[]): ChatMessage[] {
  const dialogue = messages.filter((message) => message.role !== "system");
  return [{ role: "system", content: DIRECT_CHAT_PROMPT }, ...dialogue];
}

function parseChat(raw: string): {
  messages?: ChatMessage[];
  harness?: string;
  sessionId?: string;
  gravity_context?: GravityContext;
} | null {
  try {
    return JSON.parse(raw) as {
      messages?: ChatMessage[];
      harness?: string;
      sessionId?: string;
      gravity_context?: GravityContext;
    };
  } catch {
    return null;
  }
}

function contentLength(headers: Headers): number {
  const value = Number(headers.get("content-length") || 0);
  return Number.isFinite(value) ? value : 0;
}

type Denial = { status: 401 | 402 | 403 | 413 | 429; message: string };
type Admission = { session: SessionClaims | null; hostedLive: boolean };
type Spend = Denial | { token: string };

function isDenied(result: Denial | Admission | Spend): result is Denial {
  return "status" in result;
}

function gate(headers: Headers, claimedLength: number, requestUrl: string): Denial | Admission {
  if (claimedLength > MAX_REQUEST_BYTES) return { status: 413, message: "request is too large" };
  if (!originAllowed(headers.get("origin") ?? undefined)) return { status: 403, message: "origin is not allowed" };
  const hostedLive = isHostedRequest(requestUrl) && !mockLlmEnabled();
  if (hostedLive) {
    const session = sessionFromHeaders(headers);
    if (!session) return { status: 401, message: "missing client session" };
    if (session.bal < 1) return { status: 402, message: "watch an ad to unlock tokens" };
    if (!allowModelRequest(clientIp(headers))) return { status: 429, message: "too many requests" };
    return { session, hostedLive: true };
  }
  if (!clientAuthorized(headers)) return { status: 401, message: "missing client session" };
  if (!allowModelRequest(clientIp(headers))) return { status: 429, message: "too many requests" };
  return { session: sessionFromHeaders(headers), hostedLive: false };
}

function spendLive(admission: Admission, promptTokens: number): Spend {
  if (!admission.hostedLive) return { token: "" };
  const session = admission.session;
  if (!session) return { status: 401, message: "missing client session" };
  const reserve = Math.max(1, promptTokens) + MAX_OUTPUT_TOKENS;
  if (session.bal < reserve) return { status: 402, message: "watch an ad to unlock tokens" };
  if (!commitSessionUse(session)) return { status: 401, message: "missing client session" };
  return { token: rotateSession(session, { bal: session.bal - reserve }) };
}

function writeSession(c: { header: (name: string, value: string) => void; req: { header: (name: string) => string | undefined; url: string } }, token: string): void {
  const secure = c.req.header("x-forwarded-proto") === "https" || c.req.url.startsWith("https:");
  c.header("x-subspaces-token", token);
  c.header(
    "set-cookie",
    `subspaces_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure ? "; Secure" : ""}`,
  );
}

function withSession(c: { req: { header: (name: string) => string | undefined; url: string } }, response: Response, token: string): Response {
  if (!token) return response;
  const headers = new Headers(response.headers);
  headers.set("x-subspaces-token", token);
  const secure = c.req.header("x-forwarded-proto") === "https" || c.req.url.startsWith("https:");
  headers.append(
    "set-cookie",
    `subspaces_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure ? "; Secure" : ""}`,
  );
  return new Response(response.body, { status: response.status, headers });
}

function readBalance(token: string): number {
  const claims = sessionFromHeaders({
    get(name: string) {
      return name.toLowerCase() === "x-subspaces-token" ? token : null;
    },
  });
  return claims?.bal ?? 0;
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
