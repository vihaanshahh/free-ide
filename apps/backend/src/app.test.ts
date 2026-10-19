import assert from "node:assert/strict";
import test from "node:test";
import { app } from "./app.ts";
import { GRAVITY_PIXEL_ID, MAX_REQUEST_BYTES } from "./config.ts";
import { resetLimitsForTests } from "./guard.ts";

function clientHeaders(ip: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-subspaces-client": "desktop",
    "x-forwarded-for": ip,
    ...extra,
  };
}

function restoreEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("health reports the harness off when opencode is not attached", async () => {
  const response = await app.request("/api/health");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; harness: string };
  assert.equal(body.ok, true);
  assert.equal(body.harness, "off");
});

test("GET /api/ads returns the below-response card", async () => {
  const previous = { MOCK_ADS: process.env.MOCK_ADS, GRAVITY_API_KEY: process.env.GRAVITY_API_KEY };
  process.env.MOCK_ADS = "1";
  delete process.env.GRAVITY_API_KEY;
  try {
    const response = await app.request("/api/ads");
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ad: { source?: string; placement?: string; title?: string; url?: string } };
    assert.equal(body.ad.source, "mock");
    assert.equal(body.ad.placement, "below_response");
    assert.match(body.ad.title ?? "", /pull request/i);
    assert.equal(typeof body.ad.url, "string");
  } finally {
    if (previous.MOCK_ADS === undefined) delete process.env.MOCK_ADS;
    else process.env.MOCK_ADS = previous.MOCK_ADS;
    if (previous.GRAVITY_API_KEY === undefined) delete process.env.GRAVITY_API_KEY;
    else process.env.GRAVITY_API_KEY = previous.GRAVITY_API_KEY;
  }
});

test("v1 models stay on the backend path", async () => {
  const response = await app.request("/v1/models");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { object: string };
  assert.equal(body.object, "list");
});

test("chat without opencode answers on the stub path instead of failing", async () => {
  resetLimitsForTests();
  const previous = { LLM_API_KEY: process.env.LLM_API_KEY, GRAVITY_API_KEY: process.env.GRAVITY_API_KEY };
  delete process.env.LLM_API_KEY;
  delete process.env.GRAVITY_API_KEY;
  try {
    const response = await app.request("/api/chat", {
      method: "POST",
      headers: clientHeaders("203.0.113.10"),
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        harness: "opencode",
        sessionId: "vercel-stub",
      }),
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(text.includes("not running"), false);
    assert.match(text, /"type":"chunk"/);
    assert.match(text, /"harness":"stub"/);
    assert.match(text, /"mockLlm":true/);
    assert.match(text, /"content":"Stub"/);
    assert.match(text, /"content":"harness\."/);
  } finally {
    restoreEnv(previous);
  }
});

test("config publishes the hardcoded pixel and reports mock from the key", async () => {
  const previous = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  try {
    const response = await app.request("/api/config");
    assert.equal(response.status, 200);
    const body = (await response.json()) as { pixelId: string; mockLlm: boolean; fallbackModel: string };
    assert.equal(body.pixelId, GRAVITY_PIXEL_ID);
    assert.equal(body.mockLlm, true);
    assert.equal(body.fallbackModel, "deepseek-v4.1-flash");
  } finally {
    if (previous === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previous;
  }
});

test("direct chat uses the primary model and falls back when opencode is absent", async () => {
  resetLimitsForTests();
  const previous = {
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_FALLBACK_API_KEY: process.env.LLM_FALLBACK_API_KEY,
    GRAVITY_API_KEY: process.env.GRAVITY_API_KEY,
  };
  process.env.LLM_API_KEY = "primary-test";
  delete process.env.LLM_FALLBACK_API_KEY;
  delete process.env.GRAVITY_API_KEY;
  const seen: Array<{ url: string; model?: string; system?: string }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const payload = JSON.parse(String(init?.body)) as {
      model?: string;
      messages?: Array<{ role?: string; content?: string }>;
    };
    const system = payload.messages?.find((message) => message.role === "system")?.content;
    seen.push({ url, model: payload.model, system });
    if (url.includes("api.z.ai")) return new Response("primary down", { status: 503 });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"real reply"}}]}\n\n'));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  try {
    const response = await app.request("/api/chat", {
      method: "POST",
      headers: clientHeaders("203.0.113.11"),
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are a stub harness with no tools." },
          { role: "user", content: "explain this function" },
        ],
        harness: "opencode",
        sessionId: "vercel-live",
      }),
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /real reply/);
    assert.match(text, /"harness":"stub"/);
    assert.match(text, /"mockLlm":false/);
    assert.equal(text.includes("stub harness with no tools"), false);
    assert.equal(seen.length, 2);
    assert.match(seen[0]?.url ?? "", /api\.z\.ai/);
    assert.equal(seen[0]?.model, "glm-5.3-flash");
    assert.match(seen[1]?.url ?? "", /api\.deepseek\.com/);
    assert.equal(seen[1]?.model, "deepseek-v4.1-flash");
    assert.match(seen[0]?.system ?? "", /subspaces\.si coding assistant/);
    assert.equal((seen[0]?.system ?? "").includes("stub harness"), false);
  } finally {
    globalThis.fetch = original;
    restoreEnv(previous);
  }
});

test("the completions proxy rejects missing credentials, foreign origins, and oversized bodies", async () => {
  resetLimitsForTests();
  const previous = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = "primary-test";
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    called = true;
    return new Response("should not run", { status: 500 });
  };
  try {
    const open = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.12" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(open.status, 401);
    assert.equal(called, false);

    const foreign = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: clientHeaders("203.0.113.13", { origin: "https://evil.example" }),
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(foreign.status, 403);

    const huge = "x".repeat(MAX_REQUEST_BYTES + 1);
    const oversized = await app.request("/api/chat", {
      method: "POST",
      headers: clientHeaders("203.0.113.14"),
      body: JSON.stringify({ messages: [{ role: "user", content: huge }], sessionId: "too-big" }),
    });
    assert.equal(oversized.status, 413);
    assert.equal(called, false);

    const models = await app.request("/v1/models");
    assert.equal(models.status, 200);
  } finally {
    globalThis.fetch = original;
    if (previous === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previous;
  }
});

test("model routes share a per-ip cap", async () => {
  resetLimitsForTests();
  const headers = clientHeaders("203.0.113.20", { "x-subspaces-client": "cli" });
  for (let i = 0; i < 30; i += 1) {
    const response = await app.request("/v1/chat/completions", {
      method: "POST",
      headers,
      body: "not-json",
    });
    assert.equal(response.status, 400);
  }
  const blocked = await app.request("/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], sessionId: "rate-ip" }),
  });
  assert.equal(blocked.status, 429);
});

test("a session token from the app authorizes web chat", async () => {
  resetLimitsForTests();
  const previous = { LLM_API_KEY: process.env.LLM_API_KEY, GRAVITY_API_KEY: process.env.GRAVITY_API_KEY };
  delete process.env.LLM_API_KEY;
  delete process.env.GRAVITY_API_KEY;
  try {
    const minted = await app.request("/api/session", { headers: { "x-forwarded-for": "203.0.113.30" } });
    assert.equal(minted.status, 200);
    const body = (await minted.json()) as { token: string };
    assert.ok(body.token);
    const chat = await app.request("/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-subspaces-token": body.token,
        "x-forwarded-for": "203.0.113.31",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        sessionId: "web-session",
      }),
    });
    assert.equal(chat.status, 200);
    assert.match(await chat.text(), /"mockLlm":true/);
  } finally {
    restoreEnv(previous);
  }
});
