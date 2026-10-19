import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LLM_BASE_URL, LLM_FALLBACK_BASE_URL } from "./config.ts";
import { decideCompletion, forwardCompletion, toolTraces, upstreamTargets, type ChatCompletionBody } from "./provider.ts";

const SOURCE = `export async function listInvoices(query: InvoiceQuery = {}) {
  const rows = await db.invoice.findMany();
  const filtered = query.status ? rows.filter((row) => row.status === query.status) : rows;
  return { items: filtered };
}
`;

function body(messages: ChatCompletionBody["messages"], tools = true): ChatCompletionBody {
  return {
    model: "glm-5.3-flash",
    stream: true,
    messages,
    tools: tools
      ? [
          { type: "function", function: { name: "read", parameters: {} } },
          { type: "function", function: { name: "edit", parameters: {} } },
        ]
      : [],
  };
}

const system = {
  role: "system",
  content: "You are opencode.\n<env>\n  Working directory: /workspace/examples/tallyhouse-api\n</env>",
};

test("canned provider reads a file before it edits", () => {
  const file = "/workspace/examples/tallyhouse-api/src/routes/invoices.ts";
  const first = decideCompletion(
    body([
      system,
      { role: "user", content: "Edit src/routes/invoices.ts so listInvoices returns nextCursor: null next to items." },
    ]),
    () => SOURCE,
  );
  assert.equal(first.kind, "tool");
  if (first.kind !== "tool") return;
  assert.equal(first.name, "read");
  assert.equal(first.args.filePath, file);

  const second = decideCompletion(
    body([
      system,
      { role: "user", content: "Edit src/routes/invoices.ts so listInvoices returns nextCursor: null next to items." },
      {
        role: "assistant",
        tool_calls: [{ id: "call_read", type: "function", function: { name: "read", arguments: JSON.stringify({ filePath: file }) } }],
      },
      { role: "tool", tool_call_id: "call_read", content: "1: export async function listInvoices" },
    ]),
    () => SOURCE,
  );
  assert.equal(second.kind, "tool");
  if (second.kind !== "tool") return;
  assert.equal(second.name, "edit");
  assert.match(String(second.args.newString), /nextCursor: null/);
  assert.equal(second.args.oldString, "  return { items: filtered };");

  const third = decideCompletion(
    body([
      system,
      { role: "user", content: "Edit src/routes/invoices.ts so listInvoices returns nextCursor: null next to items." },
      {
        role: "assistant",
        tool_calls: [{ id: "call_edit", type: "function", function: { name: "edit", arguments: "{}" } }],
      },
      { role: "tool", tool_call_id: "call_edit", content: "edited" },
    ]),
    () => SOURCE,
  );
  assert.equal(third.kind, "text");
});

test("tool traces pair calls with results", () => {
  const traces = toolTraces([
    { role: "assistant", tool_calls: [{ id: "call_read", function: { name: "read", arguments: "{\"filePath\":\"a.ts\"}" } }] },
    { role: "tool", tool_call_id: "call_read", content: "ok" },
  ]);
  assert.equal(traces.length, 1);
  assert.equal(traces[0]?.hasResult, true);
  assert.equal(traces[0]?.args.filePath, "a.ts");
});

test("upstream fallback is attempted after the primary model fails", async () => {
  const previous = {
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_FALLBACK_API_KEY: process.env.LLM_FALLBACK_API_KEY,
  };
  process.env.LLM_API_KEY = "primary-test";
  delete process.env.LLM_FALLBACK_API_KEY;
  const seen: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    seen.push(url);
    const payload = JSON.parse(String(init?.body)) as { model?: string; max_tokens?: number };
    assert.equal(payload.max_tokens, 2048);
    if (url.startsWith(LLM_BASE_URL)) {
      assert.equal(payload.model, "glm-5.3-flash");
      return new Response("nope", { status: 503 });
    }
    assert.equal(payload.model, "deepseek-v4.1-flash");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  try {
    assert.equal(upstreamTargets().length, 2);
    const response = await forwardCompletion(
      { model: "glm-5.3-flash", messages: [{ role: "user", content: "hi" }], stream: true, max_tokens: 99999 },
      fetchImpl,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(seen, [`${LLM_BASE_URL}/chat/completions`, `${LLM_FALLBACK_BASE_URL}/chat/completions`]);
    assert.match(await response.text(), /ok/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("edit plan reads from the workspace file the caller supplies", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subspaces-plan-"));
  const file = path.join(dir, "note.ts");
  fs.writeFileSync(file, SOURCE);
  const decision = decideCompletion(
    {
      model: "glm-5.3-flash",
      tools: [
        { type: "function", function: { name: "read" } },
        { type: "function", function: { name: "edit" } },
      ],
      messages: [
        { role: "system", content: `Working directory: ${dir}` },
        { role: "user", content: "Edit note.ts so listInvoices returns nextCursor: null" },
        {
          role: "assistant",
          content: [{ type: "tool-call", toolCallId: "call_read", toolName: "read", args: { filePath: file } }],
        },
        { role: "tool", tool_call_id: "call_read", content: "read" },
      ],
    },
    (target) => fs.readFileSync(target, "utf8"),
  );
  assert.equal(decision.kind, "tool");
  if (decision.kind === "tool") assert.equal(decision.args.filePath, file);
});
