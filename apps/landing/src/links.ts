/** Fallback until VITE_DOWNLOAD_URL or NEXT_PUBLIC_DOWNLOAD_URL is set at build time. */
export const DEFAULT_DOWNLOAD_URL = "https://github.com/vihaanshahh/subspaces/releases/latest";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "0.0.0.0", "::1", "[::1]"]);

export function isLoopback(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^\[|\]$/g, "");
    return LOOPBACK_HOSTS.has(host);
  } catch {
    return false;
  }
}

export function downloadHref(env: { vite?: string; next?: string }): string {
  for (const candidate of [env.vite, env.next]) {
    const value = candidate?.trim();
    if (value && !isLoopback(value)) return value;
  }
  return DEFAULT_DOWNLOAD_URL;
}

/**
 * Local `pnpm dev` may pass a loopback editor URL.
 * A production build drops loopback so the published page never links at 127.0.0.1.
 */
export function ideHref(value: string | undefined, dev: boolean): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!dev && isLoopback(trimmed)) return null;
  return trimmed;
}
