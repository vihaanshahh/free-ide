import { messagesForAds } from "./strip.ts";
import type { AdCreative, ChatMessage, GravityContext } from "./types.ts";

const svg = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">${body}</svg>`,
  )}`;

const quillfernImage = svg(
  `<rect width="160" height="120" rx="8" fill="#e7f6ea"/>
   <rect x="18" y="28" width="124" height="64" rx="8" fill="#143d22"/>
   <text x="80" y="66" text-anchor="middle" fill="#fffefc" font-family="ui-sans-serif,system-ui" font-size="16" font-weight="700">pr-412</text>`,
);

const lanternImage = svg(
  `<rect width="160" height="120" rx="8" fill="#1b2430"/>
   <text x="16" y="36" fill="#9ad7a8" font-family="ui-monospace,monospace" font-size="11">GET /invoices 200</text>
   <text x="16" y="58" fill="#d5e6d4" font-family="ui-monospace,monospace" font-size="11">index createdAt</text>
   <text x="16" y="80" fill="#8aa0b2" font-family="ui-monospace,monospace" font-size="11">12ms  rows=20</text>`,
);

function dot(color: string): string {
  return svg(`<circle cx="80" cy="60" r="28" fill="${color}"/>`);
}

export function mockBelowAd(): AdCreative {
  return {
    adText: "Preview this pagination change before review starts.",
    title: "A live URL for every pull request",
    brandName: "Quillfern",
    cta: "Try Quillfern",
    url: "https://example.com/quillfern",
    favicon: dot("#1f7a3a"),
    brandImage: quillfernImage,
    clickUrl: "",
    impUrl: "",
    placement: "below_response",
    placement_id: "below_response",
    source: "mock",
    layout: "image_right",
  };
}

export function mockSidebarAd(): AdCreative {
  return {
    adText: "Structured logs for small Node APIs.",
    title: "Logs you can grep in prod",
    brandName: "Lanternlog",
    cta: "Try free",
    url: "https://example.com/lanternlog",
    favicon: dot("#245c86"),
    brandImage: lanternImage,
    clickUrl: "",
    impUrl: "",
    placement: "right_page",
    placement_id: "sidebar",
    source: "mock",
    layout: "image_right",
  };
}

function mockEnabled(): boolean {
  if (process.env.MOCK_ADS === "0") return false;
  if (process.env.MOCK_ADS === "1") return true;
  return !process.env.GRAVITY_API_KEY;
}

function asCreative(raw: Record<string, unknown>, placementId: string): AdCreative | null {
  const adText = typeof raw.adText === "string" ? raw.adText : "";
  const title = typeof raw.title === "string" ? raw.title : "";
  if (!adText && !title) return null;
  const brandImage = typeof raw.brandImage === "string" ? raw.brandImage : "";
  return {
    adText,
    title: title || adText,
    brandName: typeof raw.brandName === "string" ? raw.brandName : "Sponsored",
    cta: typeof raw.cta === "string" ? raw.cta : "",
    url: typeof raw.url === "string" ? raw.url : "",
    favicon: typeof raw.favicon === "string" ? raw.favicon : "",
    brandImage,
    clickUrl: typeof raw.clickUrl === "string" ? raw.clickUrl : "",
    impUrl: typeof raw.impUrl === "string" ? raw.impUrl : "",
    placement: typeof raw.placement === "string" ? raw.placement : "below_response",
    placement_id: typeof raw.placement_id === "string" ? raw.placement_id : placementId,
    source: "gravity",
    layout: brandImage ? "image_right" : "native",
  };
}

interface GravityLike {
  getAds: (
    req: unknown,
    messages: Array<{ role: string; content: string }>,
    placements: Array<{ placement: string; placement_id: string }>,
  ) => Promise<{ ads?: unknown[] }>;
}

let gravityClient: GravityLike | null | undefined;

async function client(): Promise<GravityLike | null> {
  if (gravityClient !== undefined) return gravityClient;
  if (!process.env.GRAVITY_API_KEY) {
    gravityClient = null;
    return null;
  }
  try {
    const mod = (await import("@gravity-ai/api")) as { Gravity: new (opts: { production: boolean }) => GravityLike };
    gravityClient = new mod.Gravity({ production: process.env.GRAVITY_PRODUCTION === "1" });
    return gravityClient;
  } catch (error) {
    console.warn("Gravity SDK did not load. Mock creatives stay available.", error);
    gravityClient = null;
    return null;
  }
}

export async function fetchPlacements(input: {
  messages: ChatMessage[];
  gravityContext?: GravityContext;
  headers: Record<string, string | undefined>;
  remoteAddress?: string;
}): Promise<{ below: AdCreative | null; sidebar: AdCreative | null }> {
  const stripped = messagesForAds(input.messages);
  const sdk = await client();
  let below: AdCreative | null = null;
  let sidebar: AdCreative | null = null;

  if (sdk && stripped.length > 0) {
    const req = {
      body: {
        gravity_context: input.gravityContext ?? {},
        messages: stripped,
      },
      headers: {
        "user-agent": input.gravityContext?.device?.ua || input.headers["user-agent"] || "",
        "x-forwarded-for": input.headers["x-forwarded-for"] || input.remoteAddress || "",
      },
    };
    try {
      const result = await sdk.getAds(req, stripped, [
        { placement: "below_response", placement_id: "below_response" },
        { placement: "right_page", placement_id: "sidebar" },
      ]);
      const ads = Array.isArray(result.ads) ? result.ads : [];
      for (const ad of ads) {
        if (!ad || typeof ad !== "object") continue;
        const creative = asCreative(ad as Record<string, unknown>, "below_response");
        if (!creative) continue;
        if (creative.placement_id === "sidebar" || creative.placement === "right_page") {
          sidebar = creative;
        } else if (!below) {
          below = creative;
        }
      }
    } catch (error) {
      console.warn("Gravity getAds failed closed.", error);
    }
  }

  if (mockEnabled()) {
    if (!below) below = mockBelowAd();
    if (!sidebar) sidebar = mockSidebarAd();
  }

  return { below, sidebar };
}
