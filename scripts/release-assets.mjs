/** Stable public download names. Landing buttons and the public release use the same files. */

export const PUBLIC_RELEASE_REPO = "vihaanshahh/subspaces-releases";

export const PUBLIC_DOWNLOAD_BASE = `https://github.com/${PUBLIC_RELEASE_REPO}/releases/latest/download`;

export const RELEASE_TARGETS = [
  { id: "darwin-arm64", label: "Mac Apple Silicon", file: "subspaces-si-darwin-arm64.tar.gz" },
  { id: "darwin-x64", label: "Mac Intel", file: "subspaces-si-darwin-x64.tar.gz" },
  { id: "linux-x64", label: "Linux", file: "subspaces-si-linux-x64.tar.gz" },
];

const VERSIONED = /^subspaces-si-(.+)-(darwin-arm64|darwin-x64|linux-x64)\.tar\.gz$/;

export function parseVersionedArchive(name) {
  const match = VERSIONED.exec(name);
  if (!match) return null;
  return { version: match[1], target: match[2], file: name };
}

export function targetById(id) {
  return RELEASE_TARGETS.find((item) => item.id === id) || null;
}

/**
 * Pick one versioned archive per platform.
 * Stable names (`subspaces-si-darwin-arm64.tar.gz`) are ignored; packaging emits versioned names.
 * @param {string[]} names
 */
export function selectArchives(names) {
  /** @type {Map<string, { version: string, target: string, file: string }>} */
  const chosen = new Map();
  for (const name of names) {
    const parsed = parseVersionedArchive(name);
    if (!parsed || chosen.has(parsed.target)) continue;
    chosen.set(parsed.target, parsed);
  }
  const missing = RELEASE_TARGETS.filter((item) => !chosen.has(item.id)).map((item) => item.id);
  const versions = [...new Set([...chosen.values()].map((item) => item.version))];
  return { chosen, missing, versions, version: versions.length === 1 ? versions[0] : "" };
}

/**
 * @param {{ version: string, tag: string, baseUrl: string, assets: Array<{ id: string, label: string, file: string, size: number, sha256: string }> }} input
 */
export function buildManifest(input) {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  return {
    version: input.version,
    tag: input.tag,
    baseUrl,
    assets: input.assets.map((asset) => ({
      id: asset.id,
      label: asset.label,
      file: asset.file,
      url: `${baseUrl}/${asset.file}`,
      size: asset.size,
      sha256: asset.sha256,
    })),
  };
}
