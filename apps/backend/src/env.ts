import fs from "node:fs";
import path from "node:path";

/** Load a local env file without overriding variables already set in the process. */
export function loadEnvFile(file = path.resolve(import.meta.dirname, "../../../.env")): void {
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

export function flag(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export function mockLlmEnabled(): boolean {
  return flag("MOCK_LLM", !process.env.LLM_API_KEY);
}

export function repoRoot(): string {
  return path.resolve(import.meta.dirname, "../../..");
}
