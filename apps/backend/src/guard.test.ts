import assert from "node:assert/strict";
import test from "node:test";
import {
  allowModelRequest,
  clientAuthorized,
  clientIp,
  corsOrigin,
  issueSessionToken,
  originAllowed,
  resetLimitsForTests,
  verifySessionToken,
} from "./guard.ts";
import { MODEL_REQUESTS_PER_MINUTE } from "./config.ts";

test("cors allows the public hosts and localhost only", () => {
  assert.equal(corsOrigin("https://www.subspaces.si"), "https://www.subspaces.si");
  assert.equal(corsOrigin("https://subspaces.si"), "https://subspaces.si");
  assert.equal(corsOrigin("https://subspaces.vercel.app"), "https://subspaces.vercel.app");
  assert.equal(corsOrigin("http://localhost:41825"), "http://localhost:41825");
  assert.equal(corsOrigin("http://127.0.0.1:41824"), "http://127.0.0.1:41824");
  assert.equal(corsOrigin("https://evil.example"), null);
  assert.equal(originAllowed(undefined), true);
  assert.equal(originAllowed("https://evil.example"), false);
});

test("session tokens verify and desktop or cli headers authorize", () => {
  const token = issueSessionToken();
  assert.equal(verifySessionToken(token), true);
  assert.equal(verifySessionToken("nope.sig"), false);
  const headers = (values: Record<string, string>) => ({
    get(name: string) {
      return values[name.toLowerCase()] ?? null;
    },
  });
  assert.equal(clientAuthorized(headers({ "x-subspaces-client": "cli" })), true);
  assert.equal(clientAuthorized(headers({ "x-subspaces-client": "desktop" })), true);
  assert.equal(clientAuthorized(headers({ authorization: "Bearer subspaces-local" })), true);
  assert.equal(clientAuthorized(headers({ "x-subspaces-token": token })), true);
  assert.equal(clientAuthorized(headers({})), false);
});

test("model calls are capped per ip", () => {
  resetLimitsForTests();
  for (let i = 0; i < MODEL_REQUESTS_PER_MINUTE; i += 1) {
    assert.equal(allowModelRequest("203.0.113.50"), true);
  }
  assert.equal(allowModelRequest("203.0.113.50"), false);
  assert.equal(allowModelRequest("203.0.113.51"), true);
});

test("hosted IP attribution ignores caller-provided forwarded-for", () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.20",
      "x-vercel-forwarded-for": "203.0.113.20",
    });
    assert.equal(clientIp(headers), "203.0.113.20");
    headers.delete("x-vercel-forwarded-for");
    assert.equal(clientIp(headers), "unknown");
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
  delete process.env.VERCEL;
  try {
    const headers = new Headers({ "x-forwarded-for": "198.51.100.20" });
    assert.equal(clientIp(headers, true), "unknown");
    assert.equal(clientIp(headers, false), "198.51.100.20");
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});
