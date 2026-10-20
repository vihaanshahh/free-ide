import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MODEL_REQUESTS_PER_MINUTE } from "./config.ts";

const TOKEN_SECRET = "subspaces-session-v1";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const WINDOW_MS = 60_000;
const REWARD_WINDOW_MS = 60 * 60 * 1000;
const REWARD_LIMIT = 6;
export const REWARD_COOLDOWN_MS = 20_000;

const ALLOWED_ORIGINS = new Set([
  "https://subspaces.si",
  "https://www.subspaces.si",
  "https://subspaces.vercel.app",
]);

const CLIENTS = new Set(["desktop", "cli", "web"]);
const LOCAL_BEARER = "Bearer subspaces-local";

export interface SessionClaims {
  sid: string;
  exp: number;
  bal: number;
  seq: number;
  rew: number;
}

const hits = new Map<string, number[]>();
const seenSeq = new Map<string, number>();
const redeemedImpressions = new Set<string>();
const trialIps = new Set<string>();

export function corsOrigin(origin: string): string | null {
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  return corsOrigin(origin) !== null;
}

export function clientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 80);
  }
  return (headers.get("x-real-ip") || "unknown").slice(0, 80);
}

/** True on Vercel, and on any non-loopback host. Loopback dev is the local IDE only. */
export function isHostedRequest(requestUrl: string): boolean {
  if (process.env.VERCEL === "1") return true;
  try {
    const host = new URL(requestUrl).hostname;
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
  } catch {
    return true;
  }
}

export function issueSessionToken(now = Date.now(), patch: Partial<SessionClaims> = {}): string {
  const claims: SessionClaims = {
    sid: patch.sid || randomBytes(9).toString("base64url"),
    exp: patch.exp ?? now + TOKEN_TTL_MS,
    bal: nonNegative(patch.bal ?? 0),
    seq: nonNegative(patch.seq ?? 0),
    rew: nonNegative(patch.rew ?? 0),
  };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSessionToken(token: string | undefined, now = Date.now()): SessionClaims | null {
  if (!token || token.length > 2048) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionClaims>;
    if (typeof parsed.exp !== "number" || parsed.exp <= now) return null;
    if (typeof parsed.sid !== "string" || !/^[A-Za-z0-9_-]{4,80}$/.test(parsed.sid)) return null;
    if (typeof parsed.bal !== "number" || typeof parsed.seq !== "number" || typeof parsed.rew !== "number") return null;
    return {
      sid: parsed.sid,
      exp: parsed.exp,
      bal: nonNegative(parsed.bal),
      seq: nonNegative(parsed.seq),
      rew: nonNegative(parsed.rew),
    };
  } catch {
    return null;
  }
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  return readSessionToken(token, now) !== null;
}

function cookieSessionToken(cookie: string): string | undefined {
  const match = /(?:^|;\s*)subspaces_session=([^;]+)/.exec(cookie);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

/** The signed token the caller already holds, if it still verifies. */
export function presentedSessionToken(
  headers: { get(name: string): string | null },
  now = Date.now(),
): string | null {
  const headerToken = headers.get("x-subspaces-token")?.trim();
  if (headerToken && readSessionToken(headerToken, now)) return headerToken;
  const fromCookie = cookieSessionToken(headers.get("cookie") || "");
  if (fromCookie && readSessionToken(fromCookie, now)) return fromCookie;
  const authorization = headers.get("authorization") || "";
  if (authorization.startsWith("Bearer ")) {
    const bearer = authorization.slice("Bearer ".length).trim();
    if (readSessionToken(bearer, now)) return bearer;
  }
  return null;
}

export function sessionFromHeaders(
  headers: { get(name: string): string | null },
  now = Date.now(),
): SessionClaims | null {
  const token = presentedSessionToken(headers, now);
  return token ? readSessionToken(token, now) : null;
}

export function rotateSession(
  claims: SessionClaims,
  patch: { bal?: number; rew?: number },
  now = Date.now(),
): string {
  return issueSessionToken(now, {
    sid: claims.sid,
    exp: claims.exp,
    bal: patch.bal ?? claims.bal,
    seq: claims.seq + 1,
    rew: patch.rew ?? claims.rew,
  });
}

/** False when this signed sequence was already spent on this instance. */
export function commitSessionUse(claims: SessionClaims): boolean {
  const prev = seenSeq.get(claims.sid) ?? -1;
  if (claims.seq <= prev) return false;
  seenSeq.set(claims.sid, claims.seq);
  return true;
}

export function rewardCooldownOk(claims: SessionClaims, now = Date.now()): boolean {
  return now - claims.rew >= REWARD_COOLDOWN_MS;
}

/** False when this Gravity impression was already redeemed. */
export function redeemImpression(id: string): boolean {
  if (!id || id.length > 500 || redeemedImpressions.has(id)) return false;
  redeemedImpressions.add(id);
  return true;
}

export function clientAuthorized(headers: { get(name: string): string | null }, now = Date.now()): boolean {
  const client = headers.get("x-subspaces-client")?.trim().toLowerCase();
  if (client && CLIENTS.has(client)) return true;
  if (headers.get("authorization") === LOCAL_BEARER) return true;
  return sessionFromHeaders(headers, now) !== null;
}

export function allowModelRequest(ip: string, now = Date.now()): boolean {
  return take(`model:${ip}`, MODEL_REQUESTS_PER_MINUTE, WINDOW_MS, now);
}

export function allowSessionMint(ip: string, now = Date.now()): boolean {
  return take(`session:${ip}`, 20, WINDOW_MS, now);
}

/** First session for an IP receives the trial. Later sessions from that IP start at zero. */
export function claimTrial(ip: string, amount: number): number {
  const key = ip.slice(0, 80) || "unknown";
  if (trialIps.has(key)) return 0;
  trialIps.add(key);
  return Math.max(0, Math.floor(amount));
}

export function allowReward(ip: string, now = Date.now()): boolean {
  return take(`reward:${ip}`, REWARD_LIMIT, REWARD_WINDOW_MS, now);
}

export function resetLimitsForTests(): void {
  hits.clear();
  seenSeq.clear();
  redeemedImpressions.clear();
  trialIps.clear();
}

function sign(body: string): string {
  return createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
}

function nonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function take(key: string, limit: number, windowMs: number, now: number): boolean {
  const recent = (hits.get(key) || []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
