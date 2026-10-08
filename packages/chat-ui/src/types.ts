export interface AdCreative {
  adText: string;
  title: string;
  brandName: string;
  cta: string;
  url: string;
  favicon: string;
  brandImage: string;
  clickUrl: string;
  impUrl: string;
  placement: string;
  placement_id: string;
  source: "gravity" | "mock";
  layout: "image_right" | "native";
}

export interface UsageSnapshot {
  totalTokens: number;
  softCap: number;
  slowed: boolean;
  blocked: boolean;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  harness?: "opencode" | "stub";
  ad?: AdCreative | null;
  pending?: boolean;
  error?: string;
}

export interface PublicConfig {
  mockLlm: boolean;
  gravity: boolean;
  pixelId: string | null;
  modelLabel: string;
  softCap: number;
}
