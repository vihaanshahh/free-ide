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

export const AD_PLACEMENTS = [
  { placement: "below_response", placement_id: "below_response" },
  { placement: "right_response", placement_id: "sidebar" },
] as const;

function mockEnabled(): boolean {
  return !process.env.GRAVITY_API_KEY?.trim();
}

function stringField(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  return typeof value === "string" ? value : "";
}

function isSidebarSlot(placement: string, placementId: string): boolean {
  return placementId === "sidebar" || placement === "right_response" || placement === "right_page";
}

function slotFor(raw: Record<string, unknown>, index: number): { placement: string; placement_id: string } {
  const placement = stringField(raw, "placement");
  const placementId = stringField(raw, "placement_id");
  if (placement || placementId) {
    const sidebar = isSidebarSlot(placement, placementId);
    return {
      placement: placement || (sidebar ? "right_response" : "below_response"),
      placement_id: placementId || (sidebar ? "sidebar" : "below_response"),
    };
  }
  return AD_PLACEMENTS[index] ?? AD_PLACEMENTS[0];
}

function asCreative(
  raw: Record<string, unknown>,
  slot: { placement: string; placement_id: string },
): AdCreative | null {
  const adText = stringField(raw, "adText");
  const title = stringField(raw, "title");
  if (!adText && !title) return null;
  const brandImage = stringField(raw, "brandImage");
  return {
    ...raw,
    adText,
    title: title || adText,
    brandName: stringField(raw, "brandName") || "Sponsored",
    cta: stringField(raw, "cta"),
    url: stringField(raw, "url"),
    favicon: stringField(raw, "favicon"),
    brandImage,
    clickUrl: stringField(raw, "clickUrl"),
    impUrl: stringField(raw, "impUrl"),
    placement: slot.placement,
    placement_id: slot.placement_id,
    source: "gravity",
    layout: brandImage ? "image_right" : "native",
  };
}

export interface GravityLike {
  getAds: (
    req: unknown,
    messages: Array<{ role: string; content: string }>,
    placements: Array<{ placement: string; placement_id: string }>,
  ) => Promise<{ ads?: unknown[]; status?: number; error?: string }>;
}

let gravityClient: GravityLike | null | undefined;

export function setGravityClientForTests(client: GravityLike | null): void {
  gravityClient = client;
}

export function resetGravityClient(): void {
  gravityClient = undefined;
}

async function client(): Promise<GravityLike | null> {
  if (gravityClient !== undefined) return gravityClient;
  if (!process.env.GRAVITY_API_KEY) {
    gravityClient = null;
    return null;
  }
  try {
    const mod = (await import("@gravity-ai/api")) as {
      Gravity: new (opts: { production: boolean; alwaysReturn?: boolean }) => GravityLike;
    };
    const production = process.env.GRAVITY_PRODUCTION === "1";
    gravityClient = new mod.Gravity({ production, alwaysReturn: !production });
    return gravityClient;
  } catch (error) {
    console.warn("Gravity SDK did not load.", error instanceof Error ? error.message : "unknown");
    gravityClient = null;
    return null;
  }
}

let hostIp: Promise<string | null> | null = null;

function lookupHostIp(): Promise<string | null> {
  if (!hostIp) {
    hostIp = fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(3000) })
      .then((response) => response.json() as Promise<{ ip?: string }>)
      .then((body) => (typeof body.ip === "string" ? body.ip : null))
      .catch(() => null);
  }
  return hostIp;
}

function publicAddress(value: string | undefined): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim() ?? "";
  if (!first || first === "::1" || first.startsWith("127.") || first === "0.0.0.0") return null;
  return first;
}

export async function fetchPlacements(input: {
  messages: ChatMessage[];
  gravityContext?: GravityContext;
  headers: Record<string, string | undefined>;
  remoteAddress?: string;
}): Promise<{ below: AdCreative | null; sidebar: AdCreative | null }> {
  const stripped = messagesForAds(input.messages).filter(
    (message) => message.role === "user" || message.role === "assistant",
  );
  const sdk = await client();
  let below: AdCreative | null = null;
  let sidebar: AdCreative | null = null;

  if (sdk && stripped.length > 0) {
    const forwarded = publicAddress(input.headers["x-forwarded-for"]) || publicAddress(input.remoteAddress);
    const ip = forwarded || (await lookupHostIp());
    const context = {
      sessionId: input.gravityContext?.sessionId || "local-demo",
      user: { userId: input.gravityContext?.user?.userId || "local-demo" },
      device: {
        ...(input.gravityContext?.device ?? {}),
        ...(ip ? { ip } : {}),
      },
    };
    const req = {
      body: {
        gravity_context: context,
        messages: stripped,
      },
      headers: {
        "user-agent": context.device.ua || input.headers["user-agent"] || "",
        ...(ip ? { "x-forwarded-for": ip } : {}),
      },
    };
    try {
      const result = await sdk.getAds(req, stripped, [...AD_PLACEMENTS]);
      if (result.error || (result.status && result.status >= 400)) {
        console.warn(`Gravity getAds status=${result.status ?? 0}`);
      }
      const ads = Array.isArray(result.ads) ? result.ads : [];
      ads.forEach((ad, index) => {
        if (!ad || typeof ad !== "object") return;
        const raw = ad as Record<string, unknown>;
        const creative = asCreative(raw, slotFor(raw, index));
        if (!creative) return;
        if (isSidebarSlot(creative.placement, creative.placement_id)) sidebar = creative;
        else if (!below) below = creative;
      });
    } catch (error) {
      console.warn("Gravity getAds failed closed.", error instanceof Error ? error.message : "unknown");
    }
  }

  if (mockEnabled()) {
    if (!below) below = mockBelowAd();
    if (!sidebar) sidebar = mockSidebarAd();
  }

  return { below, sidebar };
}

export interface RewardProof {
  ok: boolean;
  impressionId: string;
  ad: AdCreative | null;
}

let rewardOverride: (() => Promise<RewardProof>) | null = null;

export function setRewardProofForTests(next: (() => Promise<RewardProof>) | null): void {
  rewardOverride = next;
}

/**
 * Credits require an ad the server fetched from Gravity.
 * Client-supplied token amounts and impression URLs are ignored.
 */
export async function confirmGravityReward(input: {
  headers: Record<string, string | undefined>;
  remoteAddress?: string;
}): Promise<RewardProof> {
  if (rewardOverride) return rewardOverride();
  const { below, sidebar } = await fetchPlacements({
    messages: [{ role: "user", content: "Sponsored placement for subspaces.si." }],
    headers: input.headers,
    remoteAddress: input.remoteAddress,
  });
  const ad = [below, sidebar].find((item) => item?.source === "gravity") ?? null;
  if (!ad || ad.source !== "gravity") return { ok: false, impressionId: "", ad: null };
  const impressionId = (ad.impUrl || `gravity:${ad.url}:${ad.title}`).trim();
  if (!impressionId) return { ok: false, impressionId: "", ad: null };
  return { ok: true, impressionId, ad };
}
