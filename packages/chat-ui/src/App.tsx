import { useEffect, useMemo, useRef, useState } from "react";
import { GravityAdCard } from "./GravityAdCard";
import { Mark } from "./Mark";
import { OfficialAd } from "./OfficialAd";
import { connectChat, connectSidebar, gravityContext, installPixel, sessionId } from "./bridge";
import type { AdCreative, ChatTurn, PublicConfig } from "./types";

const SAMPLE =
  "Edit src/routes/invoices.ts so listInvoices returns nextCursor: null next to items.";

function AdSlot({ ad }: { ad: AdCreative }) {
  if (ad.source === "gravity") return <OfficialAd ad={ad} />;
  return <GravityAdCard ad={ad} />;
}

function Rich({ text }: { text: string }) {
  const chunks = text.split(/(```[\w]*\n[\s\S]*?```)/g);
  return (
    <div className="rich">
      {chunks.map((chunk, index) => {
        if (!chunk.startsWith("```")) {
          return (
            <p key={index} className="prose">
              {chunk}
            </p>
          );
        }
        const code = chunk.replace(/^```[\w]*\n/, "").replace(/```$/, "");
        return (
          <pre key={index}>
            <code>{code}</code>
          </pre>
        );
      })}
    </div>
  );
}

function Chat() {
  const [harness, setHarness] = useState<"opencode" | "stub">("opencode");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [usage, setUsage] = useState<string>("");
  const threadRef = useRef<HTMLDivElement | null>(null);
  const id = useMemo(() => sessionId(), []);

  useEffect(() => {
    const link = connectChat(
      (event) => {
        if (event.type === "chunk" && typeof event.content === "string") {
          const content = event.content;
          setTurns((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (!last || last.role !== "assistant") return current;
            next[next.length - 1] = { ...last, content: last.content + content, pending: true };
            return next;
          });
        }
        if (event.type === "error" && typeof event.message === "string") {
          const message = event.message;
          setTurns((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (!last || last.role !== "assistant") return current;
            next[next.length - 1] = { ...last, error: message, pending: false };
            return next;
          });
          setBusy(false);
        }
        if (event.type === "done") {
          const ad = (event.ad as AdCreative | null) ?? null;
          const snapshot = event.usage as { totalTokens?: number; slowed?: boolean } | undefined;
          setTurns((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (!last || last.role !== "assistant") return current;
            next[next.length - 1] = { ...last, ad, pending: false };
            return next;
          });
          if (snapshot?.totalTokens != null) {
            const slowed = snapshot.slowed ? " · slowed at soft cap" : "";
            setUsage(`${snapshot.totalTokens.toLocaleString()} tokens this session${slowed}`);
          }
          setBusy(false);
        }
      },
      setConfig,
    );
    return () => link.dispose();
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [turns]);

  useEffect(() => {
    if (config?.pixelId) installPixel(config.pixelId);
  }, [config?.pixelId]);

  function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const history = [
      ...turns
        .filter((turn) => turn.content && !turn.error)
        .map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user" as const, content },
    ];
    setTurns((current) => [
      ...current,
      { id: `u-${Date.now()}`, role: "user", content },
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: "",
        harness,
        pending: true,
      },
    ]);
    setDraft("");
    setBusy(true);
    post(history);
  }

  function post(messages: Array<{ role: "user" | "assistant"; content: string }>) {
    const vscode = window.__SUBSPACES_VSCODE__;
    const payload = {
      messages,
      harness,
      sessionId: id,
      gravity_context: gravityContext(id),
    };
    if (vscode) {
      vscode.postMessage({ type: "chat", payload });
      return;
    }
    const direct = connectChat(
      (event) => {
        window.dispatchEvent(new MessageEvent("message", { data: { type: "event", event } }));
      },
      () => undefined,
    );
    void direct.send(payload);
  }

  const model = config?.modelLabel || "GLM-5.3-Flash";

  return (
    <div className="app">
      <div className="pills" data-testid="harness-pill">
        <button
          type="button"
          className={harness === "opencode" ? "pill active" : "pill"}
          onClick={() => setHarness("opencode")}
        >
          opencode
          {config?.opencode ? (
            <span className="live" data-testid="harness-live">
              live
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={harness === "stub" ? "pill active" : "pill"}
          onClick={() => setHarness("stub")}
        >
          stub
        </button>
      </div>
      <div className="thread" ref={threadRef}>
        {turns.length === 0 ? (
          <div className="empty">
            <Mark size={56} />
            <p className="wordmark">subspaces.si</p>
            <p className="lede">Flash chat in the editor. Ads keep it free. No Pro tier.</p>
            <button type="button" className="sample" data-testid="sample-prompt" onClick={() => send(SAMPLE)}>
              Add nextCursor to listInvoices
            </button>
          </div>
        ) : null}
        {turns.map((turn) =>
          turn.role === "user" ? (
            <div key={turn.id} className="turn">
              <div className="who">you</div>
              <p className="user-text">{turn.content}</p>
            </div>
          ) : (
            <div key={turn.id} className="turn">
              <div className="assistant-head">
                <Mark size={22} />
                <span className="meta">
                  {turn.harness || "opencode"}
                  <span>{config?.mockLlm === false ? model : `${model} · canned provider`}</span>
                </span>
              </div>
              {turn.content ? (
                <div data-testid="assistant-reply">
                  <Rich text={turn.content} />
                </div>
              ) : null}
              {turn.pending && !turn.content ? <p className="pending">Thinking…</p> : null}
              {turn.error ? <p className="error">{turn.error}</p> : null}
              {turn.ad ? <AdSlot ad={turn.ad} /> : null}
            </div>
          ),
        )}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <textarea
          data-testid="chat-input"
          value={draft}
          placeholder="Ask subspaces to change something…"
          rows={2}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(draft);
            }
          }}
        />
        <button className="send" type="submit" data-testid="chat-send" disabled={busy}>
          Send
        </button>
        {busy ? (
          <button
            className="send stop"
            type="button"
            data-testid="chat-stop"
            onClick={() => {
              window.__SUBSPACES_VSCODE__?.postMessage({ type: "cancel", sessionId: id });
              setBusy(false);
            }}
          >
            Stop
          </button>
        ) : null}
      </form>
      <div className="usage">{usage || "15M soft cap · slows, does not block"}</div>
    </div>
  );
}

function Sidebar() {
  const [ad, setAd] = useState<AdCreative | null>(null);
  useEffect(() => connectSidebar(setAd), []);
  if (!ad) return <div className="sidebar-empty" />;
  return (
    <div className="sidebar">
      <AdSlot ad={ad} />
    </div>
  );
}

export function App() {
  const surface = window.__SUBSPACES__?.surface ?? "chat";
  return surface === "sidebar" ? <Sidebar /> : <Chat />;
}
