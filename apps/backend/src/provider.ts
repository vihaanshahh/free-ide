import fs from "node:fs";
import path from "node:path";
import { estimateTokens } from "./ledger.ts";
import { ledger } from "./runtime.ts";
import { mockLlmEnabled } from "./env.ts";

export const PRIMARY_MODEL = "glm-5.3-flash";
export const FALLBACK_MODEL = "deepseek-v4.1-flash";

export interface ChatCompletionBody {
  model?: string;
  messages?: Array<Record<string, unknown>>;
  stream?: boolean;
  tools?: unknown[];
  stream_options?: { include_usage?: boolean };
}

export type Completion =
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; args: Record<string, unknown> };

interface ToolTrace {
  id: string;
  name: string;
  args: Record<string, unknown>;
  hasResult: boolean;
}

let activeSession = "opencode";

export function withProviderSession<T>(sessionId: string, run: () => Promise<T>): Promise<T> {
  const previous = activeSession;
  activeSession = sessionId;
  return run().finally(() => {
    activeSession = previous;
  });
}

export function providerSession(): string {
  return activeSession;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const record = part as Record<string, unknown>;
      if (typeof record.text === "string") return record.text;
      if (typeof record.content === "string") return record.content;
      return "";
    })
    .join("\n");
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

export function toolTraces(messages: Array<Record<string, unknown>>): ToolTrace[] {
  const traces: ToolTrace[] = [];
  const byId = new Map<string, ToolTrace>();

  function add(id: string, name: string, args: Record<string, unknown>) {
    const trace = { id, name, args, hasResult: false };
    traces.push(trace);
    if (id) byId.set(id, trace);
  }

  function mark(id: string | undefined) {
    if (!id) {
      const open = [...traces].reverse().find((trace) => !trace.hasResult);
      if (open) open.hasResult = true;
      return;
    }
    const trace = byId.get(id);
    if (trace) trace.hasResult = true;
  }

  for (const message of messages) {
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const call of calls) {
      if (!call || typeof call !== "object") continue;
      const record = call as Record<string, unknown>;
      const fn = (record.function ?? {}) as Record<string, unknown>;
      const name = String(fn.name ?? record.name ?? "");
      if (!name) continue;
      add(String(record.id ?? name), name, parseArgs(fn.arguments ?? record.arguments ?? record.args));
    }
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (!part || typeof part !== "object") continue;
        const record = part as Record<string, unknown>;
        if (record.type === "tool-call" || record.type === "tool_use" || record.type === "tool_call") {
          const name = String(record.toolName ?? record.name ?? "");
          if (!name) continue;
          add(String(record.toolCallId ?? record.id ?? name), name, parseArgs(record.args ?? record.input ?? record.arguments));
        }
        if (record.type === "tool-result" || record.type === "tool_result") {
          mark(typeof record.toolCallId === "string" ? record.toolCallId : undefined);
        }
      }
    }
    if (message.role === "tool") {
      mark(typeof message.tool_call_id === "string" ? message.tool_call_id : undefined);
    }
  }
  return traces;
}

function systemText(messages: Array<Record<string, unknown>>): string {
  return messages
    .filter((message) => message.role === "system")
    .map((message) => textOf(message.content))
    .join("\n");
}

function lastUserText(messages: Array<Record<string, unknown>>): string {
  const users = messages.filter((message) => message.role === "user");
  return textOf(users.at(-1)?.content);
}

export function workingDirectory(system: string): string {
  const match = /Working directory:\s*(\S+)/.exec(system);
  if (match?.[1]) return match[1];
  return process.env.SUBSPACES_WORKSPACE || path.resolve(import.meta.dirname, "../../../examples/tallyhouse-api");
}

function toolNames(body: ChatCompletionBody): Set<string> {
  const names = new Set<string>();
  for (const tool of body.tools ?? []) {
    if (!tool || typeof tool !== "object") continue;
    const record = tool as Record<string, unknown>;
    const fn = (record.function ?? {}) as Record<string, unknown>;
    const name = String(fn.name ?? record.name ?? "");
    if (name) names.add(name);
  }
  return names;
}

function insideRoot(file: string, root: string): boolean {
  const resolved = path.resolve(file);
  const base = path.resolve(root);
  return resolved === base || resolved.startsWith(base + path.sep);
}

export function targetFile(userText: string, cwd: string): string | null {
  const match = userText.match(/(?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|jsx|py|md|json|prisma)/);
  if (!match) {
    if (/invoice/i.test(userText)) return path.join(cwd, "src/routes/invoices.ts");
    return null;
  }
  const candidate = path.resolve(cwd, match[0]);
  if (!insideRoot(candidate, cwd)) return null;
  return candidate;
}

export function planEdit(source: string, userText: string): { oldString: string; newString: string } | null {
  const wantsCursor = /nextcursor|pagination|cursor|invoice/i.test(userText);
  const returnLine = "  return { items: filtered };";
  const returnNext = "  return { items: filtered, nextCursor: null };";
  if (wantsCursor && source.includes(returnLine)) {
    return { oldString: returnLine, newString: returnNext };
  }
  if (wantsCursor && source.includes(returnNext)) {
    return null;
  }
  const signature = "export async function listInvoices";
  if (/comment/i.test(userText) && source.includes(signature) && !source.includes("Lists invoices for the open workspace.")) {
    return {
      oldString: signature,
      newString: `// Lists invoices for the open workspace.\n${signature}`,
    };
  }
  return null;
}

function proseReply(userText: string): string {
  if (/paginat|cursor|invoice/i.test(userText)) {
    return "Cursor pagination on GET /invoices keeps the page small: default 20, max 100, and nextCursor only when another row exists. Ask me to edit src/routes/invoices.ts and I will apply it in the workspace.";
  }
  return "I can edit a file in this workspace. Name the path and the change, and I will read it before I write.";
}

export function decideCompletion(body: ChatCompletionBody, readFile: (file: string) => string = defaultRead): Completion {
  const messages = body.messages ?? [];
  const system = systemText(messages);
  const userText = lastUserText(messages);
  if (/^\s*(title|summarize|summary)\b/i.test(userText) || /generate a (short )?title/i.test(system)) {
    return { kind: "text", text: "Invoice list edit" };
  }
  const names = toolNames(body);
  const cwd = workingDirectory(system);
  const file = targetFile(userText, cwd);
  const wantsEdit = /edit|change|update|add|return|comment|pagination|nextcursor/i.test(userText);
  if (!file || !wantsEdit || !names.has("read") || !names.has("edit")) {
    return { kind: "text", text: proseReply(userText) };
  }

  const traces = toolTraces(messages);
  const readDone = traces.some((trace) => trace.name === "read" && trace.hasResult);
  const editDone = traces.some((trace) => trace.name === "edit" && trace.hasResult);
  if (editDone || traces.filter((trace) => trace.hasResult).length >= 4) {
    return {
      kind: "text",
      text: "Updated listInvoices so the payload includes nextCursor beside items.",
    };
  }
  if (!readDone) {
    return { kind: "tool", name: "read", args: { filePath: file } };
  }

  let source = "";
  try {
    source = readFile(file);
  } catch {
    return { kind: "text", text: "I could not read that file from the workspace." };
  }
  const edit = planEdit(source, userText);
  if (!edit) {
    return {
      kind: "text",
      text: "I read the file. The requested line is already in place, so I left it unchanged.",
    };
  }
  return {
    kind: "tool",
    name: "edit",
    args: { filePath: file, oldString: edit.oldString, newString: edit.newString, replaceAll: false },
  };
}

function defaultRead(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function chunk(id: string, model: string, delta: Record<string, unknown>, finish: string | null) {
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

export function completionFrames(body: ChatCompletionBody, decision: Completion): string[] {
  const id = `chatcmpl_${Math.random().toString(36).slice(2, 10)}`;
  const model = body.model || PRIMARY_MODEL;
  const frames: string[] = [];
  const push = (value: unknown) => frames.push(`data: ${JSON.stringify(value)}\n\n`);
  if (decision.kind === "tool") {
    const callId = `call_${decision.name}_${frames.length}`;
    push(chunk(id, model, { role: "assistant", tool_calls: [{ index: 0, id: callId, type: "function", function: { name: decision.name, arguments: "" } }] }, null));
    push(chunk(id, model, { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(decision.args) } }] }, null));
    push(chunk(id, model, {}, "tool_calls"));
  } else {
    const words = decision.text.split(/(\s+)/);
    push(chunk(id, model, { role: "assistant" }, null));
    for (const word of words) {
      if (!word) continue;
      push(chunk(id, model, { content: word }, null));
    }
    push(chunk(id, model, {}, "stop"));
  }
  const prompt = estimateTokens(JSON.stringify(body.messages ?? []));
  const completion = decision.kind === "text" ? estimateTokens(decision.text) : estimateTokens(JSON.stringify(decision.args));
  push({
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [],
    usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion },
  });
  frames.push("data: [DONE]\n\n");
  ledger.record(activeSession, prompt, completion);
  return frames;
}

export function completionJson(body: ChatCompletionBody, decision: Completion) {
  const prompt = estimateTokens(JSON.stringify(body.messages ?? []));
  const completion = decision.kind === "text" ? estimateTokens(decision.text) : estimateTokens(JSON.stringify(decision.args));
  ledger.record(activeSession, prompt, completion);
  const message =
    decision.kind === "tool"
      ? {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: `call_${decision.name}`,
              type: "function",
              function: { name: decision.name, arguments: JSON.stringify(decision.args) },
            },
          ],
        }
      : { role: "assistant", content: decision.text };
  return {
    id: `chatcmpl_${Math.random().toString(36).slice(2, 10)}`,
    object: "chat.completion",
    model: body.model || PRIMARY_MODEL,
    choices: [{ index: 0, message, finish_reason: decision.kind === "tool" ? "tool_calls" : "stop" }],
    usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion },
  };
}

export interface UpstreamTarget {
  base: string;
  key: string;
  model: string;
}

export function upstreamTargets(): UpstreamTarget[] {
  const primaryBase = process.env.LLM_BASE_URL?.replace(/\/$/, "") || "";
  const primaryKey = process.env.LLM_API_KEY || "";
  const primaryModel = process.env.LLM_MODEL || PRIMARY_MODEL;
  const fallbackBase = (process.env.LLM_FALLBACK_BASE_URL || process.env.LLM_BASE_URL || "").replace(/\/$/, "");
  const fallbackKey = process.env.LLM_FALLBACK_API_KEY || primaryKey;
  const fallbackModel = process.env.LLM_FALLBACK_MODEL || FALLBACK_MODEL;
  const targets: UpstreamTarget[] = [];
  if (primaryBase && primaryKey) targets.push({ base: primaryBase, key: primaryKey, model: primaryModel });
  if (fallbackBase && fallbackKey && (fallbackModel !== primaryModel || fallbackBase !== primaryBase)) {
    targets.push({ base: fallbackBase, key: fallbackKey, model: fallbackModel });
  }
  return targets;
}

export async function forwardCompletion(body: ChatCompletionBody, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const targets = upstreamTargets();
  if (targets.length === 0) {
    return Response.json(
      { error: { message: "Set LLM_BASE_URL and LLM_API_KEY, or run with MOCK_LLM=1." } },
      { status: 502 },
    );
  }
  let lastDetail = "The model proxy failed.";
  for (const target of targets) {
    try {
      const response = await fetchImpl(`${target.base}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${target.key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...body, model: target.model }),
      });
      if (response.ok && response.body) {
        const prompt = estimateTokens(JSON.stringify(body.messages ?? []));
        const [forClient, forCount] = response.body.tee();
        void countCompletion(forCount).then((completion) => {
          ledger.record(activeSession, prompt, completion);
        });
        return new Response(forClient, {
          status: response.status,
          headers: { "content-type": response.headers.get("content-type") || "text/event-stream" },
        });
      }
      lastDetail = `Model request failed (${response.status}).`;
    } catch {
      lastDetail = "The model proxy could not reach the provider.";
    }
  }
  return Response.json({ error: { message: lastDetail } }, { status: 502 });
}

async function countCompletion(stream: ReadableStream<Uint8Array>): Promise<number> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completion = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as {
          usage?: { completion_tokens?: number };
          choices?: Array<{ delta?: { content?: string } }>;
        };
        if (parsed.usage?.completion_tokens) completion = parsed.usage.completion_tokens;
        else if (parsed.choices?.[0]?.delta?.content) completion += estimateTokens(parsed.choices[0].delta.content);
      } catch {
        // Ignore keepalives.
      }
    }
  }
  return Math.max(1, completion);
}

export async function handleChatCompletions(body: ChatCompletionBody): Promise<Response> {
  if (mockLlmEnabled()) {
    const decision = decideCompletion(body);
    if (body.stream === false) {
      return Response.json(completionJson(body, decision));
    }
    const frames = completionFrames(body, decision);
    return new Response(frames.join(""), {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
    });
  }
  return forwardCompletion(body);
}

export function handleModels(): Response {
  const ids = [process.env.LLM_MODEL || PRIMARY_MODEL, process.env.LLM_FALLBACK_MODEL || FALLBACK_MODEL];
  return Response.json({
    object: "list",
    data: [...new Set(ids)].map((id) => ({ id, object: "model", owned_by: "subspaces" })),
  });
}
