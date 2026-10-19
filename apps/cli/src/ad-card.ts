import { apiOrigin } from "./config.ts";
import type { Paint } from "./style.ts";
import { paint as makePaint } from "./style.ts";

export interface SponsoredCard {
  brand: string;
  title: string;
  line: string;
  url: string;
}

export const MOCK_BELOW_CARD: SponsoredCard = {
  brand: "Quillfern",
  title: "A live URL for every pull request",
  line: "Preview this pagination change before review starts.",
  url: "https://example.com/quillfern",
};

const DEFAULT_INNER = 56;

export function renderSponsoredCard(
  card: SponsoredCard,
  options?: { color?: boolean; innerWidth?: number },
): string {
  const width = options?.innerWidth ?? DEFAULT_INNER;
  const p = makePaint(Boolean(options?.color));
  const title = row(" " + card.title, width, p, "title");
  const line = row(" " + card.line, width, p, "line");
  const url = row(" " + card.url, width, p, "url");
  const bottom = p.enabled ? p.sage(`╰${"─".repeat(width)}╯`) : `╰${"─".repeat(width)}╯`;
  return [topBorder(card.brand, width, p), title, line, url, bottom].join("\n");
}

function topBorder(brand: string, width: number, p: Paint): string {
  const room = Math.max(0, width - 14);
  const shown = clip(brand, room);
  const label = ` Sponsored · ${shown} `;
  if (label.length >= width) {
    const body = clip(label, width);
    return p.enabled ? p.sage(`╭${body}╮`) : `╭${body}╮`;
  }
  const dashes = "─".repeat(width - label.length);
  if (!p.enabled) return `╭${label}${dashes}╮`;
  return p.sage("╭") + " " + p.mint("Sponsored") + p.sage(` · ${shown} `) + p.sage(`${dashes}╮`);
}

function row(text: string, width: number, p: Paint, tone: "title" | "line" | "url"): string {
  const clipped = clip(text, width);
  const padded = clipped + " ".repeat(width - clipped.length);
  if (!p.enabled) return `│${padded}│`;
  const colored =
    tone === "title" ? p.cream(clipped) : tone === "url" ? p.link(clipped) : p.sage(clipped);
  const pad = " ".repeat(width - clipped.length);
  return p.sage("│") + colored + pad + p.sage("│");
}

export function clip(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  if (max === 1) return "…";
  return text.slice(0, max - 1) + "…";
}

export function cardFromAdsPayload(body: unknown): SponsoredCard | null {
  const record = asRecord(body);
  if (!record) return null;
  const candidates = [record.ad, record.below, record.sidebar];
  if (Array.isArray(record.ads)) candidates.push(...record.ads);
  candidates.push(record);
  for (const candidate of candidates) {
    const card = cardFromRecord(asRecord(candidate));
    if (card) return card;
  }
  return null;
}

export async function loadSponsoredCard(api: string, fetchImpl: FetchLike): Promise<SponsoredCard> {
  const origin = apiOrigin(api);
  for (const url of [`${origin}/api/ads`, `${origin}/api/ads/sidebar`]) {
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(1500),
      });
      if (!response.ok) continue;
      const card = cardFromAdsPayload(await response.json());
      if (card) return card;
    } catch {
      continue;
    }
  }
  return MOCK_BELOW_CARD;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function cardFromRecord(raw: Record<string, unknown> | null): SponsoredCard | null {
  if (!raw) return null;
  const title = stringField(raw, "title");
  const line = stringField(raw, "adText") || stringField(raw, "line");
  const url = stringField(raw, "url") || stringField(raw, "clickUrl");
  if (!title && !line) return null;
  return {
    brand: stringField(raw, "brandName") || stringField(raw, "brand") || "Sponsored",
    title: title || line,
    line: line || title,
    url,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  return typeof value === "string" ? value.trim() : "";
}
