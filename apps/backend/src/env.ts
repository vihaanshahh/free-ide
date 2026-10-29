import fs from "node:fs";
import path from "node:path";

/**
 * Repo root for dev (`apps/backend/src`) and the packaged bundle (`apps/backend/server.mjs`).
 * `./start` also sets SUBSPACES_ROOT so a bundled build does not depend on inlined paths.
 */
export function repoRoot(): string {
  const fromEnv = process.env.SUBSPACES_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  let dir = import.meta.dirname;
  const base = path.basename(dir);
  if (base === "src" || base === "dist") dir = path.dirname(dir);
  return path.resolve(dir, "../..");
}

/** Load a local env file without overriding variables already set in the process. */
export function loadEnvFile(file = path.join(repoRoot(), ".env")): void {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Canned replies only when no provider key is configured. */
export function mockLlmEnabled(): boolean {
  return !process.env.LLM_API_KEY?.trim();
}

const SECRET_ENV = [
  "LLM_API_KEY",
  "LLM_FALLBACK_API_KEY",
  "GRAVITY_API_KEY",
  "SUBSPACES_SESSION_SECRET",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

/** Strip provider secrets before any text is logged or returned to a client. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const name of SECRET_ENV) {
    const value = process.env[name]?.trim();
    if (value && value.length >= 6) out = out.split(value).join("[redacted]");
  }
  return out;
}

