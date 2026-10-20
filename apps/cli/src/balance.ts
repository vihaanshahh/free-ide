import fs from "node:fs";
import path from "node:path";
import { FALLBACK_MODEL_NAME, PRIMARY_MODEL_NAME } from "./config.ts";
import type { Paint } from "./style.ts";

export const STARTING_TOKENS = 50_000;
export const AD_REWARD_TOKENS = 15_000;
export const SOFT_CAP_TOKENS = 15_000_000;

export interface Balance {
  tokensLeft: number;
  unlocked: number;
}

export function balancePath(home: string): string {
  return path.join(home, "balance.json");
}

export function loadBalance(file: string): Balance {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Balance>;
    const tokensLeft = numberOr(parsed.tokensLeft, STARTING_TOKENS);
    const unlocked = numberOr(parsed.unlocked, 0);
    return { tokensLeft, unlocked };
  } catch {
    return { tokensLeft: STARTING_TOKENS, unlocked: 0 };
  }
}

export function saveBalance(file: string, balance: Balance): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(balance, null, 2)}\n`);
}

export function charge(balance: Balance, tokens: number): Balance {
  const spent = Math.max(0, Math.floor(tokens));
  return { ...balance, tokensLeft: Math.max(0, balance.tokensLeft - spent) };
}

/** Local demo balance only. The hosted API ignores this file and any client-sent credit. */
export function unlock(balance: Balance, tokens = AD_REWARD_TOKENS): Balance {
  const gained = Math.max(0, Math.floor(tokens));
  return {
    tokensLeft: balance.tokensLeft + gained,
    unlocked: balance.unlocked + gained,
  };
}

export function formatTokens(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString("en-US");
}

export function renderBalance(balance: Balance, p: Paint): string {
  const rows = [
    ["tokens left", formatTokens(balance.tokensLeft)],
    ["session soft cap", formatTokens(SOFT_CAP_TOKENS)],
    ["model", PRIMARY_MODEL_NAME],
    ["fallback", FALLBACK_MODEL_NAME],
  ];
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  const lines = rows.map(([label, value]) => `${p.sage(label.padEnd(labelWidth, " "))}  ${p.cream(value)}`);
  lines.push("", `${p.mint("subspaces watch-ad")} unlocks 15k tokens`);
  return lines.join("\n");
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}
