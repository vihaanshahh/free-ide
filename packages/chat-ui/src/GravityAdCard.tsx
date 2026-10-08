import { useEffect, useRef } from "react";
import type { AdCreative } from "./types";

function fireImpression(url: string) {
  if (!url.startsWith("https://")) return;
  const pixel = new Image();
  pixel.src = url;
}

export function GravityAdCard({ ad }: { ad: AdCreative }) {
  const ref = useRef<HTMLElement | null>(null);
  const seen = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || !ad.impUrl || seen.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !seen.current) {
        seen.current = true;
        fireImpression(ad.impUrl);
        observer.disconnect();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ad.impUrl]);

  const imageRight = ad.layout === "image_right" && Boolean(ad.brandImage);
  const cta = ad.cta ? (
    ad.clickUrl ? (
      <a className="ad-cta" href={ad.clickUrl} target="_blank" rel="noreferrer">
        {ad.cta}
      </a>
    ) : (
      <span className="ad-cta">{ad.cta}</span>
    )
  ) : null;

  return (
    <article
      ref={ref}
      className={imageRight ? "ad-card" : "ad-card native"}
      data-testid="gravity-ad"
      data-ad-source={ad.source}
    >
      <div>
        <div className="ad-brand">
          {ad.favicon ? <img src={ad.favicon} alt="" /> : <span className="ad-dot" />}
          <span>{ad.brandName}</span>
          {imageRight ? <span className="sponsored">Sponsored</span> : null}
          {imageRight ? null : <span className="sponsored-pill">SPONSORED</span>}
        </div>
        <h3 className="ad-title">{ad.title}</h3>
        {ad.adText ? <p className="ad-body">{ad.adText}</p> : null}
        {cta}
      </div>
      {imageRight ? <img className="ad-image" src={ad.brandImage} alt="" /> : null}
    </article>
  );
}
