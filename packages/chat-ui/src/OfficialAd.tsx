import { GravityAd } from "@gravity-ai/react";
import type { AdCreative } from "./types";

/**
 * Official card when Gravity filled the slot.
 * Mock fills use GravityAdCard so the demo still shows a white card with no key.
 */
export function OfficialAd({ ad }: { ad: AdCreative }) {
  return (
    <div className="ad-official" data-testid="gravity-ad" data-ad-source="gravity">
      <GravityAd ad={ad} theme="light" showLabel labelText="Sponsored" openInNewTab />
    </div>
  );
}
