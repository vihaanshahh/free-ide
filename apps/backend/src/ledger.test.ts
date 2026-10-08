import assert from "node:assert/strict";
import test from "node:test";
import {
  HARD_CAP_TOKENS,
  RATE_LIMIT_PER_MINUTE,
  SOFT_CAP_TOKENS,
  createMemoryLedger,
  estimateTokens,
} from "./ledger.ts";

test("soft cap is 15 million tokens and slows instead of blocking", () => {
  assert.equal(SOFT_CAP_TOKENS, 15_000_000);
  const ledger = createMemoryLedger();
  const usage = ledger.record("ada", SOFT_CAP_TOKENS, 0);
  assert.equal(usage.slowed, true);
  assert.equal(usage.blocked, false);
  assert.equal(ledger.consumeRequest("ada", 1_000).ok, true);
});

test("hard cap blocks further replies", () => {
  const ledger = createMemoryLedger();
  ledger.record("ada", HARD_CAP_TOKENS, 0);
  const gate = ledger.consumeRequest("ada", 5_000);
  assert.equal(gate.ok, false);
  assert.match(gate.reason, /Hard cap/);
});

test("per-session minute limit trips on the next call", () => {
  const ledger = createMemoryLedger();
  const now = 10_000_000;
  for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i += 1) {
    assert.equal(ledger.consumeRequest("ada", now + i).ok, true);
  }
  const blocked = ledger.consumeRequest("ada", now + 500);
  assert.equal(blocked.ok, false);
  assert.equal(ledger.consumeRequest("ada", now + 61_000).ok, true);
});

test("estimateTokens is a stable stand-in for provider usage", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcdefgh"), 2);
});
