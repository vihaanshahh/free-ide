import assert from "node:assert/strict";
import test from "node:test";
import { chatAvailability, formatTokenBalance, GRAVITY_PIXEL_ID, safeHttpUrl, statusCopy } from "./try-chat.ts";

test("try chat names the public pixel and never a provider key", () => {
  assert.equal(GRAVITY_PIXEL_ID, "9f5969b9-4f34-449e-8360-992259cd0f50");
  assert.equal(formatTokenBalance(4096), "4,096 tokens left");
  assert.equal(formatTokenBalance(-4), "0 tokens left");
  assert.equal(chatAvailability(null), "offline");
  assert.equal(chatAvailability({ mockLlm: true }), "mock");
  assert.equal(chatAvailability({ mockLlm: false }), "live");
  assert.match(statusCopy("mock").detail, /canned/);
  assert.match(statusCopy("offline").title, /Demo offline/);
  assert.equal(safeHttpUrl("https://example.com/quillfern"), "https://example.com/quillfern");
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
});
