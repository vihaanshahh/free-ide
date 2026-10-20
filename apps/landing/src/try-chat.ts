/** Public Gravity pixel. The API key stays on the server. */
export const GRAVITY_PIXEL_ID = "9f5969b9-4f34-449e-8360-992259cd0f50";

export type ChatAvailability = "offline" | "mock" | "live";

export interface PublicConfig {
  mockLlm?: boolean;
  gravity?: boolean;
  pixelId?: string;
  adReward?: number;
}

export interface AdCard {
  title?: string;
  adText?: string;
  brandName?: string;
  cta?: string;
  url?: string;
  brandImage?: string;
  source?: string;
}

export function chatAvailability(config: PublicConfig | null): ChatAvailability {
  if (!config) return "offline";
  if (config.mockLlm) return "mock";
  return "live";
}

export function statusCopy(kind: ChatAvailability): { title: string; detail: string } {
  if (kind === "offline") {
    return {
      title: "Demo offline",
      detail: "The chat service is not reachable. Nothing was charged.",
    };
  }
  if (kind === "mock") {
    return {
      title: "Mock reply",
      detail: "Replies are canned until the model key is set. A local card stands in for the ad.",
    };
  }
  return {
    title: "Live",
    detail: "GLM-5.3-Flash through the hosted chat. The server tracks this balance.",
  };
}

export function formatTokenBalance(value: number): string {
  const n = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const text = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${text} tokens left`;
}

export function safeHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
    return null;
  }
  return null;
}

interface SessionBody {
  token?: string;
  balance?: number;
  error?: string;
  ad?: AdCard | null;
}

interface DoneEvent {
  type?: string;
  content?: string;
  message?: string;
  token?: string;
  balance?: number;
  ad?: AdCard | null;
  mockLlm?: boolean;
}

export function mountTryChat(root: ParentNode = document): void {
  const panel = root.querySelector("[data-try-chat]");
  if (!(panel instanceof HTMLElement)) return;
  const status = panel.querySelector("[data-try-status]");
  const balanceEl = panel.querySelector("[data-try-balance]");
  const log = panel.querySelector("[data-try-log]");
  const form = panel.querySelector("[data-try-form]");
  const input = panel.querySelector("[data-try-input]");
  const send = panel.querySelector("[data-try-send]");
  const watch = panel.querySelector("[data-try-watch]");
  if (
    !(status instanceof HTMLElement) ||
    !(balanceEl instanceof HTMLElement) ||
    !(log instanceof HTMLElement) ||
    !(form instanceof HTMLFormElement) ||
    !(input instanceof HTMLTextAreaElement) ||
    !(send instanceof HTMLButtonElement) ||
    !(watch instanceof HTMLButtonElement)
  ) {
    return;
  }
  const transcript: HTMLElement = log;

  let token = "";
  let balance = 0;
  let kind: ChatAvailability = "offline";
  let reward = 15_000;
  let busy = false;

  const paint = () => {
    const copy = statusCopy(kind);
    status.textContent = copy.title;
    status.dataset.state = kind;
    balanceEl.textContent = formatTokenBalance(balance);
    send.disabled = busy || kind === "offline";
    input.disabled = kind === "offline";
    watch.disabled = busy || kind === "offline" || !token;
  };

  const note = (text: string) => {
    const line = document.createElement("p");
    line.className = "try-note";
    line.textContent = text;
    transcript.append(line);
    transcript.scrollTop = transcript.scrollHeight;
  };

  const showAd = (ad: AdCard | null | undefined) => {
    if (!ad || (!ad.title && !ad.adText)) return;
    const card = document.createElement("article");
    card.className = "try-ad";
    card.dataset.testid = "try-ad";
    const brand = document.createElement("p");
    brand.className = "try-ad-brand";
    brand.textContent = ad.brandName || "Sponsored";
    const title = document.createElement("h3");
    title.textContent = ad.title || "Sponsored";
    const body = document.createElement("p");
    body.textContent = ad.adText || "";
    card.append(brand, title, body);
    const href = safeHttpUrl(ad.url);
    if (href && ad.cta) {
      const link = document.createElement("a");
      link.href = href;
      link.rel = "noreferrer";
      link.target = "_blank";
      link.textContent = ad.cta;
      card.append(link);
    }
    transcript.append(card);
    transcript.scrollTop = transcript.scrollHeight;
  };

  const remember = (next: SessionBody | DoneEvent) => {
    if (typeof next.token === "string" && next.token) token = next.token;
    if (typeof next.balance === "number") balance = next.balance;
    paint();
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || busy || kind === "offline") return;
    input.value = "";
    void sendTurn(text);
  });

  watch.addEventListener("click", () => {
    void watchAd();
  });

  void boot();

  async function boot(): Promise<void> {
    const config = await fetch("/api/config")
      .then((response) => (response.ok ? (response.json() as Promise<PublicConfig>) : null))
      .catch(() => null);
    kind = chatAvailability(config);
    reward = typeof config?.adReward === "number" ? config.adReward : reward;
    installPixel(config?.pixelId || GRAVITY_PIXEL_ID);
    if (kind !== "offline") {
      const session = await fetch("/api/session")
        .then((response) => (response.ok ? (response.json() as Promise<SessionBody>) : null))
        .catch(() => null);
      if (session) remember(session);
      else kind = "offline";
    }
    paint();
    note(statusCopy(kind).detail);
  }

  async function sendTurn(text: string): Promise<void> {
    busy = true;
    paint();
    appendBubble("you", text);
    const reply = appendBubble("assistant", "");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { "x-subspaces-token": token } : {}),
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
          sessionId: "landing-try",
        }),
      });
      const rotated = response.headers.get("x-subspaces-token");
      if (rotated) token = rotated;
      if (response.status === 402) {
        reply.textContent = "Watch an ad to unlock more tokens.";
        note("The server balance is empty. Watching a verified ad unlocks more tokens.");
        return;
      }
      if (!response.ok || !response.body) {
        reply.textContent = kind === "mock" ? "The canned reply did not start." : "The reply did not start.";
        note(statusCopy(response.ok ? kind : "offline").detail);
        if (!response.ok) kind = kind === "live" ? "live" : "offline";
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let ad: AdCard | null = null;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;
          const event = JSON.parse(line.slice(5).trim()) as DoneEvent;
          if (event.type === "chunk" && event.content) reply.textContent += event.content;
          if (event.type === "error") reply.textContent = event.message || "The reply failed.";
          if (event.type === "done") {
            remember(event);
            ad = event.ad ?? null;
            if (event.mockLlm) kind = "mock";
          }
        }
      }
      if (!reply.textContent) reply.textContent = "No reply text.";
      showAd(ad);
    } catch {
      kind = "offline";
      reply.textContent = "Demo offline.";
      note(statusCopy("offline").detail);
    } finally {
      busy = false;
      paint();
      transcript.scrollTop = transcript.scrollHeight;
    }
  }

  async function watchAd(): Promise<void> {
    if (!token || busy) return;
    busy = true;
    paint();
    try {
      const response = await fetch("/api/ads/reward", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-subspaces-token": token,
        },
        body: "{}",
      });
      const body = (await response.json().catch(() => null)) as SessionBody | null;
      if (response.ok && body) {
        remember(body);
        note(`Watching an ad unlocked ${formatTokenBalance(reward).replace(" tokens left", "")} tokens.`);
        showAd(body.ad);
        return;
      }
      if (typeof body?.balance === "number") balance = body.balance;
      note(
        kind === "live"
          ? "The ad was not verified, so no tokens were added."
          : "Ads are offline in this demo, so no tokens were added.",
      );
    } catch {
      note("Ads are offline in this demo, so no tokens were added.");
    } finally {
      busy = false;
      paint();
    }
  }

  function appendBubble(role: "you" | "assistant", text: string): HTMLParagraphElement {
    const bubble = document.createElement("p");
    bubble.className = `try-bubble try-bubble-${role}`;
    bubble.textContent = text;
    transcript.append(bubble);
    return bubble;
  }
}

function installPixel(pixelId: string): void {
  if (!pixelId || document.getElementById("gravity-pixel")) return;
  const host = window as Window & { gravity?: ((...args: unknown[]) => void) & { q?: unknown[][] } };
  if (!host.gravity) {
    const gravity = ((...args: unknown[]) => {
      gravity.q = gravity.q || [];
      gravity.q.push(args);
    }) as ((...args: unknown[]) => void) & { q?: unknown[][] };
    host.gravity = gravity;
  }
  host.gravity?.("init", pixelId);
  const script = document.createElement("script");
  script.id = "gravity-pixel";
  script.async = true;
  script.src = "https://code.trygravity.ai/gr-pix.js";
  document.head.append(script);
}
