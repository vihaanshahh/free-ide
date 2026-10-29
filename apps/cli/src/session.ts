import fs from "node:fs";
import path from "node:path";
import { apiOrigin } from "./config.ts";
import type { FetchLike } from "./ad-card.ts";

export interface HostedSession {
  token: string;
  balance: number;
}

export function sessionPath(home: string): string {
  return path.join(home, "session.json");
}

function savedToken(file: string): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { token?: unknown };
    return typeof parsed.token === "string" && parsed.token.length <= 2048 ? parsed.token : null;
  } catch {
    return null;
  }
}

export async function refreshHostedSession(api: string, home: string, fetchImpl: FetchLike): Promise<HostedSession> {
  const file = sessionPath(home);
  const token = savedToken(file);
  const response = await fetchImpl(`${apiOrigin(api)}/api/session`, {
    headers: token ? { "x-subspaces-token": token } : {},
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Hosted session is unavailable (${response.status}).`);
  const body = (await response.json()) as { token?: unknown; balance?: unknown };
  if (typeof body.token !== "string" || !body.token || typeof body.balance !== "number" || !Number.isFinite(body.balance)) {
    throw new Error("Hosted session response is invalid.");
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ token: body.token })}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return { token: body.token, balance: Math.max(0, Math.floor(body.balance)) };
}
