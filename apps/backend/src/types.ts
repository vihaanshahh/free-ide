export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
  role: Role;
  content: string;
}

export type HarnessId = "opencode" | "stub";

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
  render?: unknown;
  renderer_spec?: unknown;
  composition?: unknown;
  campaignId?: string;
  variant?: string;
}

export interface GravityContext {
  sessionId?: string;
  user?: { userId?: string };
  device?: {
    ua?: string;
    timezone?: string;
    locale?: string;
    ip?: string;
  };
}
