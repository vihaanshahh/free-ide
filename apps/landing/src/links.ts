/** Public GitHub Releases. Not used until a download base URL is set at build time. */
export const PUBLIC_DOWNLOAD_BASE =
  "https://github.com/vihaanshahh/subspaces-releases/releases/latest/download";

export const RELEASE_TARGETS = [
  { id: "darwin-arm64", label: "Mac Apple Silicon", file: "subspaces-si-darwin-arm64.tar.gz" },
  { id: "darwin-x64", label: "Mac Intel", file: "subspaces-si-darwin-x64.tar.gz" },
  { id: "linux-x64", label: "Linux", file: "subspaces-si-linux-x64.tar.gz" },
] as const;

export type ReleaseTargetId = (typeof RELEASE_TARGETS)[number]["id"];

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "0.0.0.0", "::1", "[::1]"]);

export function isLoopback(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^\[|\]$/g, "");
    return LOOPBACK_HOSTS.has(host);
  } catch {
    return false;
  }
}

function usable(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || isLoopback(trimmed)) return null;
  return trimmed.replace(/\/+$/, "");
}

/**
 * Download buttons appear only when a public base URL is configured.
 * An empty config stays on the waitlist and never falls back to the private repo.
 * VITE_DOWNLOAD_URL is honored only when it already ends in `/download`.
 */
export function downloadBase(env: { base?: string; vite?: string; next?: string }): string | null {
  const explicit = usable(env.base);
  if (explicit) return explicit;
  for (const candidate of [env.vite, env.next]) {
    const value = usable(candidate);
    if (value && value.endsWith("/download")) return value;
  }
  return null;
}

export function assetUrl(base: string, file: string): string {
  return `${base.replace(/\/+$/, "")}/${file}`;
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "";
  const mb = size / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1)} MB`;
}

export function highlightTarget(platform: string, arch: string): ReleaseTargetId | null {
  const blob = `${platform} ${arch}`.toLowerCase();
  const mac = /mac|darwin|iphone|ipad/.test(blob);
  const arm = /arm|aarch64/.test(blob);
  const linux = /linux/.test(blob) && !/android/.test(blob);
  if (mac) return arm ? "darwin-arm64" : "darwin-x64";
  if (linux) return "linux-x64";
  return null;
}

/** GitHub's REST API sends CORS headers. Release asset files do not. */
export function releasesApiUrl(base: string): string | null {
  try {
    const url = new URL(base);
    if (url.hostname !== "github.com") return null;
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/releases\/latest\/download\/?$/);
    if (!match) return null;
    return `https://api.github.com/repos/${match[1]}/${match[2]}/releases/latest`;
  } catch {
    return null;
  }
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
