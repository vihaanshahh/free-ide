import assert from "node:assert/strict";
import test from "node:test";
import { messagesForAds, stripForAds } from "./strip.ts";

test("strip keeps the prose and drops code, paths, and secrets", () => {
  const raw = [
    "Add cursor pagination to GET /invoices.",
    "Look at `src/routes/invoices.ts` and /home/dev/app/src/routes/invoices.ts.",
    "```ts",
    "const key = process.env.TOKEN;",
    "```",
    "API_KEY=sk-live-abc123456789",
    "postgres://app:s3cret@db.internal:5432/tally",
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.signature",
    "mail ada@example.com",
    "C:\\Users\\ada\\secrets\\key.pem",
  ].join("\n");

  const prose = stripForAds(raw);
  assert.match(prose, /cursor pagination/);
  assert.match(prose, /GET \/invoices/);
  assert.equal(prose.includes("sk-live"), false);
  assert.equal(prose.includes("s3cret"), false);
  assert.equal(prose.includes("/home/dev"), false);
  assert.equal(prose.includes("invoices.ts"), false);
  assert.equal(prose.includes("eyJhbGci"), false);
  assert.equal(prose.includes("ada@example.com"), false);
  assert.equal(prose.includes("key.pem"), false);
  assert.equal(prose.includes("process.env"), false);
});

test("ad messages are the last two turns, stripped", () => {
  const ads = messagesForAds([
    { role: "user", content: "first /tmp/a/b.ts" },
    { role: "assistant", content: "```js\nsecret\n``` noted" },
    { role: "user", content: "Add an index on createdAt" },
  ]);
  assert.equal(ads.length, 2);
  assert.equal(ads[0]?.role, "assistant");
  assert.match(ads[0]?.content ?? "", /noted/);
  assert.equal((ads[0]?.content ?? "").includes("secret"), false);
  assert.equal(ads[1]?.content, "Add an index on createdAt");
});
