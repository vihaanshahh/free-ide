import assert from "node:assert/strict";
import test from "node:test";
import { app } from "./app.ts";

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
  const previous = { MOCK_LLM: process.env.MOCK_LLM, MOCK_ADS: process.env.MOCK_ADS };
  process.env.MOCK_LLM = "1";
  process.env.MOCK_ADS = "1";
  try {
    const response = await app.request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
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
  } finally {
    if (previous.MOCK_LLM === undefined) delete process.env.MOCK_LLM;
    else process.env.MOCK_LLM = previous.MOCK_LLM;
    if (previous.MOCK_ADS === undefined) delete process.env.MOCK_ADS;
    else process.env.MOCK_ADS = previous.MOCK_ADS;
  }
});
