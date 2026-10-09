import { assetUrl, downloadBase, formatBytes, highlightTarget, releasesApiUrl, RELEASE_TARGETS } from "./links";

type ReleaseMeta = {
  version: string;
  sizes: Record<string, number>;
};

export async function fetchReleaseMeta(base: string): Promise<ReleaseMeta | null> {
  const api = releasesApiUrl(base);
  if (!api) return null;
  const response = await fetch(api, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    tag_name?: string;
    assets?: Array<{ name?: string; size?: number }>;
  };
  const sizes: Record<string, number> = {};
  for (const asset of body.assets || []) {
    if (!asset.name || typeof asset.size !== "number") continue;
    sizes[asset.name] = asset.size;
  }
  return { version: body.tag_name || "", sizes };
}

function platformHint(): { platform: string; arch: string } {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string; architecture?: string };
  };
  const platform = nav.userAgentData?.platform || navigator.platform || navigator.userAgent;
  const arch = nav.userAgentData?.architecture || navigator.userAgent;
  return { platform, arch };
}

export function applyDownloads(env: { base?: string; vite?: string; next?: string }): void {
  const base = downloadBase(env);
  const actions = document.querySelectorAll<HTMLElement>("[data-download-actions]");
  const waitlists = document.querySelectorAll<HTMLElement>("[data-waitlist]");
  const links = document.querySelectorAll<HTMLAnchorElement>("[data-download][data-file]");
  if (!base) {
    for (const node of actions) node.hidden = true;
    for (const node of waitlists) node.hidden = false;
    return;
  }

  for (const node of actions) node.hidden = false;
  for (const node of waitlists) node.hidden = true;
  for (const link of links) {
    link.href = assetUrl(base, link.dataset.file || "");
  }

  const hint = platformHint();
  const recommended = highlightTarget(hint.platform, hint.arch);
  for (const link of links) {
    const match = Boolean(recommended && link.dataset.target === recommended);
    link.dataset.recommended = match ? "true" : "false";
    if (match) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
    const badge = link.querySelector<HTMLElement>("[data-for-you]");
    if (badge) badge.hidden = !match;
  }

  const metas = document.querySelectorAll<HTMLElement>("[data-download-meta]");
  for (const meta of metas) meta.textContent = "Latest release";

  fetchReleaseMeta(base)
    .then((meta) => {
      if (!meta) return;
      for (const link of links) {
        const size = meta.sizes[link.dataset.file || ""];
        const sizeNode = link.querySelector<HTMLElement>("[data-size]");
        if (sizeNode) sizeNode.textContent = typeof size === "number" ? formatBytes(size) : "";
      }
      const picked = RELEASE_TARGETS.find((item) => item.id === recommended);
      const pickedSize = picked && meta.sizes[picked.file] ? formatBytes(meta.sizes[picked.file]) : "";
      const summary = [meta.version, picked?.label, pickedSize].filter(Boolean).join(" · ");
      for (const meta of metas) meta.textContent = summary || "Latest release";
    })
    .catch(() => undefined);
}

export function bindWaitlist(): void {
  for (const form of document.querySelectorAll<HTMLFormElement>("[data-waitlist]")) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const note = form.querySelector<HTMLElement>("[data-waitlist-note]");
      if (note) note.hidden = false;
      const submit = form.querySelector<HTMLButtonElement>("button[type='submit']");
      if (submit) submit.disabled = true;
    });
  }
}

export function bindDemoVideo(): void {
  const video = document.querySelector<HTMLVideoElement>("[data-demo]");
  if (!video) return;
  const reveal = () => {
    video.controls = true;
  };
  video.addEventListener("click", reveal);
  document.querySelector("[data-demo-controls]")?.addEventListener("click", (event) => {
    event.preventDefault();
    reveal();
  });
}
