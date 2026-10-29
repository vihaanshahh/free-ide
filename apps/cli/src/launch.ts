import { spawn } from "node:child_process";
import path from "node:path";
import type { FetchLike } from "./ad-card.ts";
import { resolveApi } from "./config.ts";

export interface LaunchRequest {
  bin: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
}

export function resolveOpencodeBin(env: NodeJS.ProcessEnv): string {
  if (env.OPENCODE_BIN?.trim()) return env.OPENCODE_BIN.trim();
  const root = env.SUBSPACES_ROOT?.trim() || path.resolve(import.meta.dirname, "../../..");
  return path.join(root, "vendor", "opencode-runtime", "opencode");
}

export function subspacesHome(env: NodeJS.ProcessEnv): string {
  if (env.SUBSPACES_HOME?.trim()) return path.resolve(env.SUBSPACES_HOME.trim());
  const home = env.HOME?.trim() || "/tmp";
  return path.join(home, ".subspaces");
}

export async function launchOpencode(request: LaunchRequest): Promise<number> {
  const child = spawn(request.bin, request.args, {
    cwd: request.cwd,
    env: request.env,
    stdio: "inherit",
  });
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

export function runArgs(prompt: string, model: string): string[] {
  return ["run", "--model", model, "--auto", "--format", "default", prompt];
}

export function tuiArgs(model: string): string[] {
  return ["--model", model, "--auto"];
}

export async function decideMode(env: NodeJS.ProcessEnv, fetchImpl: FetchLike): Promise<"mock" | "live"> {
  const flag = (env.SUBSPACES_MOCK || "").trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return "mock";
  if (flag === "0" || flag === "false" || flag === "no") return "live";
  const reachable = await apiReachable(resolveApi(env), fetchImpl);
  return reachable ? "live" : "mock";
}

export async function apiReachable(api: string, fetchImpl: FetchLike): Promise<boolean> {
  try {
    const response = await fetchImpl(`${api.replace(/\/+$/, "")}/models`, {
      method: "GET",
      signal: AbortSignal.timeout(1200),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function adSeconds(env: NodeJS.ProcessEnv): number {
  const raw = env.SUBSPACES_AD_SECONDS;
  if (raw === undefined || raw === "") return 3;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 3;
  return Math.min(30, Math.floor(parsed));
}
