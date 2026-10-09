export function bindReveals(): void {
  const nodes = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || typeof IntersectionObserver === "undefined") {
    for (const node of nodes) node.classList.add("is-in");
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.18, rootMargin: "0px 0px -6% 0px" },
  );
  for (const node of nodes) observer.observe(node);
}

export function bindShowcase(): void {
  const frame = document.querySelector<HTMLElement>("[data-showcase]");
  if (!frame) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const rect = frame.getBoundingClientRect();
      const view = window.innerHeight || 1;
      const progress = Math.min(1, Math.max(-1, (view * 0.45 - rect.top) / view));
      frame.style.setProperty("--shift", `${(progress * 16).toFixed(2)}px`);
      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
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
