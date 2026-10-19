import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "./env.ts";
import { FALLBACK_MODEL, PRIMARY_MODEL } from "./provider.ts";

export const OPENCODE_VERSION = "1.18.27";

export interface TurnHandlers {
  onChunk: (text: string) => void | Promise<void>;
  onTool: (line: string) => void | Promise<void>;
}

interface SessionState {
  roles: Map<string, string>;
  textSent: Map<string, string>;
  toolsSent: Set<string>;
  pending: Map<string, Array<Record<string, unknown>>>;
  sawBusy: boolean;
  patches: string[];
  seenPatches: Set<string>;
}

export interface PartUpdate {
  chunks: string[];
  tools: string[];
}

export function freshSessionState(): SessionState {
  return {
    roles: new Map(),
    textSent: new Map(),
    toolsSent: new Set(),
    pending: new Map(),
    sawBusy: false,
    patches: [],
    seenPatches: new Set(),
  };
}

export function reduceOpencodeEvent(state: SessionState, event: { type?: string; properties?: Record<string, unknown> }, sessionId: string): PartUpdate {
  const empty = { chunks: [], tools: [] };
  const properties = event.properties ?? {};
  if (properties.sessionID && properties.sessionID !== sessionId) return empty;

  if (event.type === "message.updated") {
    const info = properties.info as { id?: string; role?: string } | undefined;
    if (info?.id && info.role) state.roles.set(info.id, info.role);
    if (info?.id && info.role === "assistant") {
      const queued = state.pending.get(info.id) ?? [];
      state.pending.delete(info.id);
      const merged = { chunks: [] as string[], tools: [] as string[] };
      for (const part of queued) {
        const update = applyPart(state, part);
        merged.chunks.push(...update.chunks);
        merged.tools.push(...update.tools);
      }
      return merged;
    }
    return empty;
  }

  if (event.type !== "message.part.updated") return empty;
  const part = properties.part as Record<string, unknown> | undefined;
  if (!part) return empty;
  const messageId = String(part.messageID ?? "");
  const role = state.roles.get(messageId);
  if (role !== "assistant") {
    if (!role) {
      const queued = state.pending.get(messageId) ?? [];
      queued.push(part);
      state.pending.set(messageId, queued);
    }
    return empty;
  }
  return applyPart(state, part);
}

function applyPart(state: SessionState, part: Record<string, unknown>): PartUpdate {
  const empty = { chunks: [] as string[], tools: [] as string[] };
  const partId = String(part.id ?? "");

  if (part.type === "text" && typeof part.text === "string") {
    const previous = state.textSent.get(partId) ?? "";
    if (part.text.startsWith(previous)) {
      const delta = part.text.slice(previous.length);
      state.textSent.set(partId, part.text);
      return delta ? { chunks: [delta], tools: [] } : empty;
    }
    state.textSent.set(partId, part.text);
    return { chunks: [part.text], tools: [] };
  }

  if (part.type === "tool" || part.type === "tool-invocation" || part.type === "tool_use") {
    const name = String(part.tool ?? part.toolName ?? part.name ?? "tool");
    const toolState = (part.state ?? {}) as { status?: string; input?: Record<string, unknown> };
    const status = toolState.status ?? "running";
    const key = `${partId}:${status}`;
    if (state.toolsSent.has(key)) return empty;
    state.toolsSent.add(key);
    const file = toolState.input?.filePath ?? toolState.input?.path;
    const where = typeof file === "string" ? ` ${path.basename(file)}` : "";
    return { chunks: [], tools: [`${name}${where} (${status})`] };
  }
  return empty;
}

export function formatDiff(diff: unknown): string {
  if (!Array.isArray(diff) || diff.length === 0) return "";
  const blocks: string[] = [];
  for (const item of diff) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const file = String(record.file ?? record.path ?? record.filename ?? "file");
    const patch = String(record.patch ?? record.diff ?? record.content ?? "");
    const relative = file.includes("tallyhouse-api/") ? file.slice(file.indexOf("tallyhouse-api/") + "tallyhouse-api/".length) : file;
    if (!patch.trim()) {
      blocks.push(`Edited ${relative}`);
      continue;
    }
    blocks.push(`Edited ${relative}\n\n\`\`\`diff\n${patch.trim()}\n\`\`\``);
  }
  return blocks.join("\n\n");
}

interface Waiter {
  sessionId: string;
  state: SessionState;
  handlers: TurnHandlers;
  resolve: () => void;
  reject: (error: Error) => void;
}

export class OpenCodeHarness {
  private child: ChildProcess | null = null;
  private starting: Promise<void> | null = null;
  private sessions = new Map<string, string>();
  private waiters = new Set<Waiter>();
  private eventAbort: AbortController | null = null;
  private resolveEvents: (() => void) | null = null;
  private eventsConnected = new Promise<void>((resolve) => {
    this.resolveEvents = resolve;
  });
  readonly version = OPENCODE_VERSION;

  constructor(
    private readonly options: {
      bin: string;
      port: number;
      workspace: string;
      configPath: string;
      home: string;
      external?: boolean;
    },
  ) {}

  baseUrl(): string {
    return `http://127.0.0.1:${this.options.port}`;
  }

  async start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = this.boot();
    return this.starting;
  }

  private async boot(): Promise<void> {
    if (this.options.external) {
      await this.waitForHealth();
      this.listen();
      return;
    }
    if (!fs.existsSync(this.options.bin)) {
      throw new Error("opencode binary is missing. Run pnpm setup so the pinned release can be downloaded.");
    }
    fs.mkdirSync(this.options.home, { recursive: true });
    fs.mkdirSync(path.dirname(this.options.configPath), { recursive: true });
    writeConfig(this.options.configPath);
    const env = childEnv(this.options.home, this.options.configPath);
    this.child = spawn(
      this.options.bin,
      ["serve", "--port", String(this.options.port), "--hostname", "127.0.0.1", "--print-logs", "--log-level", "WARN"],
      { cwd: this.options.workspace, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    const logPath = path.join(repoRoot(), ".subspaces", "opencode.log");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const log = fs.createWriteStream(logPath, { flags: "a" });
    this.child.stdout?.pipe(log);
    this.child.stderr?.pipe(log);
    this.child.on("exit", () => {
      this.child = null;
      this.starting = null;
    });
    await this.waitForHealth();
    this.listen();
  }

  private async waitForHealth(): Promise<void> {
    const deadline = Date.now() + 20_000;
    let last = "starting";
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${this.baseUrl()}/global/health`);
        if (response.ok) {
          await response.arrayBuffer().catch(() => undefined);
          return;
        }
        last = `status ${response.status}`;
      } catch (error) {
        last = error instanceof Error ? error.message : "offline";
      }
      await sleep(200);
    }
    throw new Error(`opencode serve did not become healthy (${last}).`);
  }

  private listen(): void {
    this.eventAbort = new AbortController();
    const abort = this.eventAbort;
    void (async () => {
      while (!abort.signal.aborted) {
        try {
          const response = await fetch(`${this.baseUrl()}/event`, { signal: abort.signal });
          if (!response.ok || !response.body) {
            await sleep(400);
            continue;
          }
          this.resolveEvents?.();
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!abort.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";
            for (const frame of frames) {
              const line = frame.split("\n").find((item) => item.startsWith("data:"));
              if (!line) continue;
              const data = line.slice(5).trim();
              if (!data) continue;
              try {
                this.dispatch(JSON.parse(data) as { type?: string; properties?: Record<string, unknown> });
              } catch {
                // Ignore malformed frames.
              }
            }
          }
        } catch {
          if (!abort.signal.aborted) await sleep(400);
        }
      }
    })();
  }

  private dispatch(event: { type?: string; properties?: Record<string, unknown> }): void {
    for (const waiter of this.waiters) {
      const update = reduceOpencodeEvent(waiter.state, event, waiter.sessionId);
      for (const chunk of update.chunks) void waiter.handlers.onChunk(chunk);
      for (const tool of update.tools) void waiter.handlers.onTool(tool);
      const status = event.properties?.status as { type?: string } | undefined;
      const eventSession = event.properties?.sessionID;
      if (eventSession !== waiter.sessionId) continue;
      if (event.type === "session.status" && status?.type === "busy") waiter.state.sawBusy = true;
      const idle = event.type === "session.idle" || (event.type === "session.status" && status?.type === "idle");
      if (idle && waiter.state.sawBusy) waiter.resolve();
      if (event.type === "session.error") {
        waiter.reject(new Error("opencode session failed."));
      }
    }
  }

  async runTurn(input: { sessionKey: string; text: string; signal?: AbortSignal } & TurnHandlers): Promise<string> {
    await this.start();
    const ocSession = await this.ensureSession(input.sessionKey);
    const state = freshSessionState();
    const response = await fetch(this.instance(`/session/${ocSession}/prompt_async`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: { providerID: "subspaces", modelID: PRIMARY_MODEL },
        parts: [{ type: "text", text: input.text }],
      }),
      signal: input.signal,
    });
    if (!response.ok && response.status !== 204) {
      const detail = await response.text().catch(() => "");
      throw new Error(`opencode rejected the prompt (${response.status}). ${detail.slice(0, 180)}`);
    }
    const deadline = Date.now() + 90_000;
    let sawBusy = false;
    while (Date.now() < deadline) {
      if (input.signal?.aborted) {
        await this.abort(ocSession);
        throw new Error("The turn was cancelled.");
      }
      const status = (await this.readJson(`/session/status`)) as Record<string, { type?: string }> | null;
      const entry = status?.[ocSession];
      if (entry?.type === "busy") sawBusy = true;
      await this.publish(ocSession, state, input);
      const busy = entry?.type === "busy";
      const progressed = state.textSent.size > 0 || [...state.toolsSent].some((key) => key.endsWith(":completed"));
      if (!busy && (sawBusy || progressed)) break;
      await sleep(150);
    }
    if (state.textSent.size === 0 && state.toolsSent.size === 0) {
      throw new Error("opencode turn timed out.");
    }
    const sessionDiff = formatDiff(await this.readJson(`/session/${ocSession}/diff`));
    if (sessionDiff) return sessionDiff;
    return state.patches.join("\n\n");
  }

  private async publish(ocSession: string, state: SessionState, handlers: TurnHandlers): Promise<void> {
    const messages = (await this.readJson(`/session/${ocSession}/message`)) as Array<{
      info?: { role?: string };
      parts?: Array<Record<string, unknown>>;
    }> | null;
    if (!Array.isArray(messages)) return;
    for (const message of messages) {
      if (message.info?.role !== "assistant") continue;
      for (const part of message.parts ?? []) {
        const update = applyPart(state, part);
        for (const chunk of update.chunks) await handlers.onChunk(chunk);
        for (const tool of update.tools) await handlers.onTool(tool);
        const meta = ((part.state ?? {}) as { metadata?: { diff?: string; filediff?: { file?: string; patch?: string } } }).metadata;
        const patch = meta?.diff || meta?.filediff?.patch;
        const file = meta?.filediff?.file || ((part.state as { input?: { filePath?: string } } | undefined)?.input?.filePath ?? "file");
        if (typeof patch === "string" && patch.includes("@@") && !state.seenPatches.has(patch)) {
          state.seenPatches.add(patch);
          state.patches.push(formatDiff([{ file, patch }]));
        }
      }
    }
  }

  private async readJson(pathname: string): Promise<unknown> {
    try {
      const response = await fetch(this.instance(pathname));
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async cancel(sessionKey: string): Promise<void> {
    const ocSession = this.sessions.get(sessionKey);
    if (!ocSession) return;
    await this.abort(ocSession);
  }

  private async abort(ocSession: string): Promise<void> {
    await fetch(this.instance(`/session/${ocSession}/abort`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
  }

  private async ensureSession(sessionKey: string): Promise<string> {
    const existing = this.sessions.get(sessionKey);
    if (existing) return existing;
    const response = await fetch(this.instance("/session"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: sessionKey.slice(0, 40) }),
    });
    if (!response.ok) throw new Error(`opencode did not open a session (${response.status}).`);
    const body = (await response.json()) as { id?: string };
    if (!body.id) throw new Error("opencode session response had no id.");
    this.sessions.set(sessionKey, body.id);
    return body.id;
  }

  private instance(pathname: string): string {
    const url = new URL(pathname, this.baseUrl());
    url.searchParams.set("directory", this.options.workspace);
    return url.toString();
  }

  stop(): void {
    this.eventAbort?.abort();
    this.child?.kill("SIGTERM");
    this.child = null;
    this.starting = null;
  }
}

export function defaultHarness(): OpenCodeHarness {
  const root = repoRoot();
  const port = Number(process.env.OPENCODE_PORT || 41826);
  return new OpenCodeHarness({
    bin: process.env.OPENCODE_BIN || path.join(root, "vendor", "opencode-runtime", "opencode"),
    port,
    workspace: process.env.SUBSPACES_WORKSPACE || path.join(root, "examples", "tallyhouse-api"),
    configPath: path.join(root, ".subspaces", "opencode", "opencode.json"),
    home: path.join(root, ".subspaces", "opencode-home"),
  });
}

function providerBaseUrl(): string {
  const origin = process.env.SUBSPACES_API_ORIGIN?.trim().replace(/\/$/, "");
  if (origin) return `${origin}/v1`;
  const apiPort = process.env.SUBSPACES_API_PORT || "41824";
  return `http://127.0.0.1:${apiPort}/v1`;
}

function writeConfig(file: string): void {
  const model = PRIMARY_MODEL;
  const fallback = FALLBACK_MODEL;
  const body = {
    $schema: "https://opencode.ai/config.json",
    model: `subspaces/${model}`,
    small_model: `subspaces/${model}`,
    autoupdate: false,
    enabled_providers: ["subspaces"],
    permission: { edit: "allow", bash: "allow", read: "allow", write: "allow" },
    provider: {
      subspaces: {
        name: "subspaces",
        npm: "@ai-sdk/openai-compatible",
        env: ["SUBSPACES_PROVIDER_KEY"],
        options: {
          baseURL: providerBaseUrl(),
          apiKey: "subspaces-local",
        },
        models: {
          [model]: { name: "GLM-5.3-Flash", tool_call: true },
          [fallback]: { name: "DeepSeek V4.1 Flash", tool_call: true },
        },
      },
    },
  };
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
}

function childEnv(home: string, configPath: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GRAVITY_") || /API_KEY|SECRET|TOKEN|PASSWORD/i.test(key)) delete env[key];
  }
  env.HOME = home;
  env.XDG_CONFIG_HOME = path.join(home, ".config");
  env.XDG_DATA_HOME = path.join(home, ".local", "share");
  env.OPENCODE_CONFIG = configPath;
  env.SUBSPACES_PROVIDER_KEY = "subspaces-local";
  return env;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
