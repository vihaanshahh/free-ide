import { MAX_OUTPUT_TOKENS } from "./config.ts";
import { upstreamTargets } from "./provider.ts";
import type { ChatMessage, HarnessId } from "./types.ts";

export const DIRECT_CHAT_PROMPT =
  "You are the subspaces.si coding assistant. Help the user write, read, and explain code. Be concise and concrete. You have no tools in this chat, so propose edits instead of claiming you changed a file. Do not mention other editor brands.";

const PAGINATION_REPLY = `Cursor pagination on GET /invoices. Default 20, clamp the limit at 100, and return nextCursor only when another row exists.

Take one extra row so the page can tell there is more without a second count query.

\`\`\`ts
const limit = Math.min(query.limit ?? 20, 100);
const rows = await db.invoice.findMany({
  where: { status },
  orderBy: { createdAt: "desc" },
  take: limit + 1,
  ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
});
const hasMore = rows.length > limit;
const items = hasMore ? rows.slice(0, limit) : rows;
return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
\`\`\`

Index createdAt before you ship the migration. I can sketch that next if you want it in schema.prisma.`;

const GENERAL_REPLY = `I can help with that in the file you have open.

Keep the change small: one function, a test beside it, and no new dependency unless the standard library cannot do it. Paste the function you want rewritten if you want a line-by-line edit.`;

const STUB_REPLY = `Stub harness. This adapter shares the subspaces proxy, the token ledger, and the ad slot under the reply. It does not run tools or edit files.

Switch to opencode for the Flash-model reply.`;

function canned(userText: string, harness: HarnessId): string {
  if (harness === "stub") return STUB_REPLY;
  if (/paginat|cursor|invoice/i.test(userText)) return PAGINATION_REPLY;
  return GENERAL_REPLY;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function* streamMock(
  userText: string,
  harness: HarnessId,
  slowed: boolean,
): AsyncGenerator<string> {
  const reply = canned(userText, harness);
  const parts = reply.split(/(\s+)/);
  const gap = slowed ? 70 : 14;
  for (const part of parts) {
    yield part;
    if (part.trim()) await sleep(gap);
  }
}

export async function* streamFlash(
  messages: ChatMessage[],
  slowed: boolean,
  fetchImpl: typeof fetch = fetch,
): AsyncGenerator<string> {
  const targets = upstreamTargets();
  if (!targets.length) {
    throw new Error("Set LLM_API_KEY, or leave it unset for the canned demo.");
  }
  let last = "The model proxy failed.";
  for (const target of targets) {
    let opened = false;
    try {
      const response = await fetchImpl(`${target.base}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${target.key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: target.model,
          messages,
          stream: true,
          max_tokens: MAX_OUTPUT_TOKENS,
        }),
      });
      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        last = `Model request failed (${response.status}). ${detail.slice(0, 180)}`;
        continue;
      }
      opened = true;
      yield* readModelStream(response.body, slowed);
      return;
    } catch (error) {
      if (opened) throw error;
      last = error instanceof Error ? error.message : last;
    }
  }
  throw new Error(last);
}

async function* readModelStream(body: ReadableStream<Uint8Array>, slowed: boolean): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const gap = slowed ? 40 : 0;
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
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          yield content;
          if (gap) await sleep(gap);
        }
      } catch {
        // Ignore keepalives that are not JSON.
      }
    }
  }
}
