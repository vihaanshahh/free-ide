import type { AdCreative, PublicConfig } from "./types";

export interface ChatRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  harness: "opencode" | "stub";
  sessionId: string;
  gravity_context: {
    sessionId: string;
    user: { userId: string };
    device: { ua?: string; timezone?: string; locale?: string };
  };
}

type EventHandler = (event: Record<string, unknown>) => void;

export function sessionId(): string {
  const key = "subspaces.session";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const next = `sess_${Math.random().toString(36).slice(2, 12)}`;
  sessionStorage.setItem(key, next);
  return next;
}

export function gravityContext(id: string): ChatRequest["gravity_context"] {
  return {
    sessionId: id,
    user: { userId: "local-demo" },
    device: {
      ua: navigator.userAgent,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
    },
  };
}

const API = "http://127.0.0.1:41824";

export function connectChat(onEvent: EventHandler, onConfig: (config: PublicConfig) => void) {
  const vscode = window.__SUBSPACES_VSCODE__;
  if (vscode) {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; event?: Record<string, unknown>; config?: PublicConfig };
      if (data?.type === "config" && data.config) onConfig(data.config);
      if (data?.type === "event" && data.event) onEvent(data.event);
    };
    window.addEventListener("message", onMessage);
    vscode.postMessage({ type: "hello" });
    return {
      send(payload: ChatRequest) {
        vscode.postMessage({ type: "chat", payload });
      },
      dispose() {
        window.removeEventListener("message", onMessage);
      },
    };
  }

  void fetch(`${API}/api/config`)
    .then((response) => response.json())
    .then((config: PublicConfig) => onConfig(config))
    .catch(() => undefined);

  return {
    async send(payload: ChatRequest) {
      const response = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        onEvent({ type: "error", message: body?.error || "The subspaces proxy rejected the turn." });
        onEvent({ type: "done", ad: null });
        return;
      }
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;
          onEvent(JSON.parse(line.slice(5).trim()) as Record<string, unknown>);
        }
      }
    },
    dispose() {},
  };
}

export function connectSidebar(onAd: (ad: AdCreative | null) => void) {
  const vscode = window.__SUBSPACES_VSCODE__;
  if (vscode) {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; ad?: AdCreative | null };
      if (data?.type === "sidebar-ad") onAd(data.ad ?? null);
    };
    window.addEventListener("message", onMessage);
    vscode.postMessage({ type: "sidebar" });
    return () => window.removeEventListener("message", onMessage);
  }
  void fetch(`${API}/api/ads/sidebar`)
    .then((response) => response.json())
    .then((body: { ad?: AdCreative | null }) => onAd(body.ad ?? null))
    .catch(() => onAd(null));
  return () => undefined;
}
