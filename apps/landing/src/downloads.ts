import {
  BETA_TAG,
  PUBLIC_DOWNLOAD_BASE,
  RELEASE_TARGETS,
  assetUrl,
  highlightTarget,
  releasesApiUrl,
  type ReleaseTargetId,
} from "./links";

type AssetHit = { name: string; size: number };

export async function fetchReleaseAssets(): Promise<{ version: string; byTarget: Partial<Record<ReleaseTargetId, AssetHit>> } | null> {
  const response = await fetch(releasesApiUrl(), { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    tag_name?: string;
    assets?: Array<{ name?: string; size?: number }>;
  };
  const byTarget: Partial<Record<ReleaseTargetId, AssetHit>> = {};
  for (const target of RELEASE_TARGETS) {
    const suffix = `-${target.id}.tar.gz`;
    const asset = (body.assets || []).find((item) => item.name?.endsWith(suffix) && typeof item.size === "number");
    if (!asset?.name || typeof asset.size !== "number") continue;
    byTarget[target.id] = { name: asset.name, size: asset.size };
  }
  return { version: body.tag_name || BETA_TAG, byTarget };
}

function platformHint(): { platform: string; arch: string } {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string; architecture?: string };
  };
  const platform = nav.userAgentData?.platform || navigator.platform || navigator.userAgent;
  const arch = nav.userAgentData?.architecture || navigator.userAgent;
  return { platform, arch };
}

export function applyDownloads(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-download][data-target]")];
  const hint = platformHint();
  const recommended = highlightTarget(hint.platform, hint.arch);

  for (const link of links) {
    const target = RELEASE_TARGETS.find((item) => item.id === link.dataset.target);
    if (!target) continue;
    if (link.closest("[data-coming-soon]")) {
      link.addEventListener("click", (event) => event.preventDefault());
      continue;
    }
    link.href = assetUrl(target.file);
    const match = recommended === target.id;
    link.dataset.recommended = match ? "true" : "false";
    if (match) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  }

  fetchReleaseAssets()
    .then((meta) => {
      if (!meta) return;
      for (const link of links) {
        const id = link.dataset.target as ReleaseTargetId | undefined;
        if (!id) continue;
        const live = meta.byTarget[id];
        if (!live || link.closest("[data-coming-soon]")) continue;
        link.href = `${PUBLIC_DOWNLOAD_BASE}/${live.name}`;
      }
    })
    .catch(() => undefined);
}
