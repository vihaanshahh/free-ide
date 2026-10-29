/** Public beta downloads. Hardcoded so the page needs no build env vars. */
export const PUBLIC_RELEASE_REPO = "vihaanshahh/subspaces-releases";

export const PUBLIC_DOWNLOAD_BASE = `https://github.com/${PUBLIC_RELEASE_REPO}/releases/latest/download`;

export const BETA_TAG = "v0.1.0-beta";

export const RELEASE_TARGETS = [
  {
    id: "darwin-arm64",
    label: "Mac Apple Silicon",
    file: "subspaces-si-0.1.0-darwin-arm64.tar.gz",
    size: 211307257,
  },
  {
    id: "darwin-x64",
    label: "Mac Intel",
    file: "subspaces-si-0.1.0-darwin-x64.tar.gz",
    size: 231853310,
  },
  {
    id: "linux-x64",
    label: "Linux",
    file: "subspaces-si-0.1.0-linux-x64.tar.gz",
    size: 240347481,
  },
] as const;

export type ReleaseTargetId = (typeof RELEASE_TARGETS)[number]["id"];

export function assetUrl(file: string): string {
  return `${PUBLIC_DOWNLOAD_BASE}/${file}`;
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
export function releasesApiUrl(): string {
  return `https://api.github.com/repos/${PUBLIC_RELEASE_REPO}/releases/latest`;
}
