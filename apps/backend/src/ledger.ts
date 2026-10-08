export const SOFT_CAP_TOKENS = 15_000_000;
export const HARD_CAP_TOKENS = 20_000_000;
export const RATE_LIMIT_PER_MINUTE = 10;
export const RATE_LIMIT_PER_HOUR = 60;

export interface UsageSnapshot {
  accountId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  softCap: number;
  hardCap: number;
  slowed: boolean;
  blocked: boolean;
}

export interface RateGate {
  ok: boolean;
  retryAfterSec: number;
  reason: string;
}

export interface TokenLedger {
  snapshot(accountId: string): UsageSnapshot;
  record(accountId: string, promptTokens: number, completionTokens: number): UsageSnapshot;
  consumeRequest(accountId: string, now?: number): RateGate;
}

interface Bucket {
  promptTokens: number;
  completionTokens: number;
  hits: number[];
}

export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function createMemoryLedger(): TokenLedger {
  const buckets = new Map<string, Bucket>();

  function bucket(accountId: string): Bucket {
    let current = buckets.get(accountId);
    if (!current) {
      current = { promptTokens: 0, completionTokens: 0, hits: [] };
      buckets.set(accountId, current);
    }
    return current;
  }

  function snapshot(accountId: string): UsageSnapshot {
    const current = bucket(accountId);
    const totalTokens = current.promptTokens + current.completionTokens;
    return {
      accountId,
      promptTokens: current.promptTokens,
      completionTokens: current.completionTokens,
      totalTokens,
      softCap: SOFT_CAP_TOKENS,
      hardCap: HARD_CAP_TOKENS,
      slowed: totalTokens >= SOFT_CAP_TOKENS,
      blocked: totalTokens >= HARD_CAP_TOKENS,
    };
  }

  return {
    snapshot,
    record(accountId, promptTokens, completionTokens) {
      const current = bucket(accountId);
      current.promptTokens += Math.max(0, promptTokens);
      current.completionTokens += Math.max(0, completionTokens);
      return snapshot(accountId);
    },
    consumeRequest(accountId, now = Date.now()) {
      const current = bucket(accountId);
      const usage = snapshot(accountId);
      if (usage.blocked) {
        return {
          ok: false,
          retryAfterSec: 3600,
          reason: "Hard cap reached for this session. The 20M token ceiling is a stub on top of the 15M soft cap.",
        };
      }
      const minuteAgo = now - 60_000;
      const hourAgo = now - 3_600_000;
      current.hits = current.hits.filter((hit) => hit > hourAgo);
      const inMinute = current.hits.filter((hit) => hit > minuteAgo).length;
      if (inMinute >= RATE_LIMIT_PER_MINUTE) {
        return {
          ok: false,
          retryAfterSec: 60,
          reason: "Session rate limit: 10 replies a minute in this demo.",
        };
      }
      if (current.hits.length >= RATE_LIMIT_PER_HOUR) {
        return {
          ok: false,
          retryAfterSec: 3600,
          reason: "Session rate limit: 60 replies an hour in this demo.",
        };
      }
      current.hits.push(now);
      return { ok: true, retryAfterSec: 0, reason: "" };
    },
  };
}
