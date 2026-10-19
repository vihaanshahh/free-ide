import { createHmac, timingSafeEqual } from "node:crypto";
import { MODEL_REQUESTS_PER_MINUTE } from "./config.ts";

const TOKEN_SECRET = "subspaces-session-v1";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const WINDOW_MS = 60_000;

const ALLOWED_ORIGINS = new Set([
  "https://subspaces.si",
  "https://www.subspaces.si",
  "https://subspaces.vercel.app",
]);

const CLIENTS = new Set(["desktop", "cli", "web"]);
const LOCAL_BEARER = "Bearer subspaces-local";

const hits = new Map<string, number[]>();

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

export function issueSessionToken(now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ exp: now + TOKEN_TTL_MS })).toString("base64url");
  const sig = createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || token.length > 512) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { exp?: number };
    return typeof parsed.exp === "number" && parsed.exp > now;
  } catch {
    return false;
  }
}

export function clientAuthorized(headers: { get(name: string): string | null }, now = Date.now()): boolean {
  const client = headers.get("x-subspaces-client")?.trim().toLowerCase();
  if (client && CLIENTS.has(client)) return true;
  if (headers.get("authorization") === LOCAL_BEARER) return true;
  const headerToken = headers.get("x-subspaces-token")?.trim();
  if (verifySessionToken(headerToken, now)) return true;
  const cookie = headers.get("cookie") || "";
  const match = /(?:^|;\s*)subspaces_session=([^;]+)/.exec(cookie);
  return verifySessionToken(match?.[1] ? decodeURIComponent(match[1]) : undefined, now);
}

/** True when the caller is still inside the per-IP window. */
export function allowModelRequest(ip: string, now = Date.now()): boolean {
  return take(`model:${ip}`, MODEL_REQUESTS_PER_MINUTE, now);
}

export function allowSessionMint(ip: string, now = Date.now()): boolean {
  return take(`session:${ip}`, 20, now);
}

export function resetLimitsForTests(): void {
  hits.clear();
}

function take(key: string, limit: number, now: number): boolean {
  const recent = (hits.get(key) || []).filter((stamp) => now - stamp < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
