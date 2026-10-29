import { createHash } from "node:crypto";
import { MODEL_REQUESTS_PER_MINUTE, TRIAL_TOKENS } from "./config.ts";

const TRIAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PREFIX = "subspaces:v1:";

export type StateResult = { ok: true; balance: number } | { ok: false; reason: "rate" | "missing" | "balance" };

let commandForTests: ((args: Array<string | number>) => Promise<unknown>) | null = null;

export function setHostedCommandForTests(next: ((args: Array<string | number>) => Promise<unknown>) | null): void {
  commandForTests = next;
}

/** Hosted state lives in Redis. The REST API supports atomic EVAL on serverless runtimes. */
export function hostedStateConfigured(): boolean {
  const secret = process.env.SUBSPACES_SESSION_SECRET?.trim() || "";
  return Boolean(commandForTests || (
    secret.length >= 32 &&
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  ));
}

async function command(args: Array<string | number>): Promise<unknown> {
  if (commandForTests) return commandForTests(args);
  if (!hostedStateConfigured()) throw new Error("Hosted session storage is not configured.");
  const url = process.env.UPSTASH_REDIS_REST_URL!.replace(/\/$/, "");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Hosted session storage is unavailable.");
  const body = await response.json() as { result?: unknown; error?: string };
  if (body.error) throw new Error("Hosted session storage rejected a command.");
  return body.result;
}

function ipKey(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

const MINT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], 60000) end
if n > 20 then return -1 end
local trial = redis.call('SET', KEYS[2], '1', 'NX', 'PX', ARGV[2])
local balance = 0
if trial then balance = tonumber(ARGV[1]) end
redis.call('HSET', KEYS[3], 'balance', balance)
redis.call('PEXPIREAT', KEYS[3], ARGV[3])
return balance
`;

export async function mintHostedSession(sid: string, ip: string, expires: number): Promise<StateResult> {
  const hash = ipKey(ip);
  const result = Number(await command([
    "EVAL", MINT, 3,
    `${PREFIX}mint:${hash}`,
    `${PREFIX}trial:${hash}`,
    `${PREFIX}session:${sid}`,
    TRIAL_TOKENS, TRIAL_TTL_MS, expires,
  ]));
  return result < 0 ? { ok: false, reason: "rate" } : { ok: true, balance: result };
}

export async function hostedBalance(sid: string): Promise<number | null> {
  const value = await command(["HGET", `${PREFIX}session:${sid}`, "balance"]);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

const RATE = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], 60000) end
return n
`;

export async function allowHostedModelRequest(ip: string): Promise<boolean> {
  const result = Number(await command([
    "EVAL", RATE, 1, `${PREFIX}model:${ipKey(ip)}`,
  ]));
  return result <= MODEL_REQUESTS_PER_MINUTE;
}

const SPEND = `
local balance = redis.call('HGET', KEYS[1], 'balance')
if not balance then return -1 end
balance = tonumber(balance)
local cost = tonumber(ARGV[1])
if balance < cost then return -2 end
balance = redis.call('HINCRBY', KEYS[1], 'balance', -cost)
return balance
`;

export async function spendHostedSession(sid: string, tokens: number): Promise<StateResult> {
  const cost = Math.max(1, Math.floor(tokens));
  const result = Number(await command([
    "EVAL", SPEND, 1, `${PREFIX}session:${sid}`, cost,
  ]));
  if (result === -1) return { ok: false, reason: "missing" };
  if (result === -2) return { ok: false, reason: "balance" };
  if (!Number.isSafeInteger(result) || result < 0) throw new Error("Hosted balance was invalid.");
  return { ok: true, balance: result };
}
