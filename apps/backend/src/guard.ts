import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MODEL_REQUESTS_PER_MINUTE } from "./config.ts";

// Local sessions are ephemeral. Hosted sessions require a configured secret.
const LOCAL_TOKEN_SECRET = randomBytes(32).toString("base64url");
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const WINDOW_MS = 60_000;

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

export function clientIp(headers: { get(name: string): string | null }, hosted = false): string {
  // Vercel supplies this header at its ingress. A self-hosted deployment must
  // configure a trusted proxy before using client IPs for grants or limits.
  if (hosted && process.env.VERCEL !== "1") return "unknown";
  const forwarded = process.env.VERCEL === "1"
    ? headers.get("x-vercel-forwarded-for")
    : headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 80);
  }
  if (process.env.VERCEL === "1") return "unknown";
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

export function resetLimitsForTests(): void {
  hits.clear();
  trialIps.clear();
}

function sign(body: string): string {
  return createHmac("sha256", process.env.SUBSPACES_SESSION_SECRET?.trim() || LOCAL_TOKEN_SECRET)
    .update(body).digest("base64url");
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
