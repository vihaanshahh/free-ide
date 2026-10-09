import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { formatDiff, freshSessionState, OpenCodeHarness, reduceOpencodeEvent } from "./harness.ts";

test("event reducer streams assistant text once and names tool calls", () => {
  const state = freshSessionState();
  const sessionId = "ses_test";
  reduceOpencodeEvent(
    state,
    { type: "message.updated", properties: { sessionID: sessionId, info: { id: "msg_a", role: "assistant" } } },
    sessionId,
  );
  const first = reduceOpencodeEvent(
    state,
    {
      type: "message.part.updated",
      properties: { sessionID: sessionId, part: { id: "prt_1", messageID: "msg_a", type: "text", text: "Hello" } },
    },
    sessionId,
  );
  const second = reduceOpencodeEvent(
    state,
    {
      type: "message.part.updated",
      properties: { sessionID: sessionId, part: { id: "prt_1", messageID: "msg_a", type: "text", text: "Hello there" } },
    },
    sessionId,
  );
  const tool = reduceOpencodeEvent(
    state,
    {
      type: "message.part.updated",
      properties: {
        sessionID: sessionId,
        part: {
          id: "prt_2",
          messageID: "msg_a",
          type: "tool",
          tool: "edit",
          state: { status: "completed", input: { filePath: "/workspace/examples/tallyhouse-api/src/routes/invoices.ts" } },
        },
      },
    },
    sessionId,
  );
  assert.deepEqual(first.chunks, ["Hello"]);
  assert.deepEqual(second.chunks, [" there"]);
  assert.deepEqual(tool.tools, ["edit invoices.ts (completed)"]);
  assert.match(formatDiff([{ file: "/workspace/examples/tallyhouse-api/src/routes/invoices.ts", patch: "- old\n+ new" }]), /```diff/);
});

test("adapter sends a prompt, streams the reply, and returns the diff", async () => {
  const events: http.ServerResponse[] = [];
  let messages: unknown[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname === "/global/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ healthy: true, version: "1.18.27" }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/session") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "ses_test" }));
      return;
    }
    if (url.pathname === "/event") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.write(": connected\n\n");
      events.push(res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/session/ses_test/prompt_async") {
      messages = [
        {
          info: { id: "msg_a", role: "assistant" },
          parts: [{ id: "prt_1", type: "text", text: "Edited invoices." }],
        },
      ];
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === "/session/status") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({}));
      return;
    }
    if (url.pathname === "/session/ses_test/message") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(messages));
      return;
    }
    if (url.pathname === "/session/ses_test/diff") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ file: "src/routes/invoices.ts", patch: "- return { items: filtered };\n+ return { items: filtered, nextCursor: null };" }]));
      return;
    }
    if (req.method === "POST" && url.pathname === "/session/ses_test/abort") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("true");
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const sockets = new Set<import("node:net").Socket>();
  server.on("connection", (socket) => sockets.add(socket));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const harness = new OpenCodeHarness({
    bin: "unused",
    port,
    workspace: "/workspace/examples/tallyhouse-api",
    configPath: "/tmp/opencode-test-config.json",
    home: "/tmp/opencode-test-home",
    external: true,
  });
  const chunks: string[] = [];
  try {
    const diff = await harness.runTurn({
      sessionKey: "sess_demo",
      text: "Edit the invoice route.",
      onChunk: (text) => {
        chunks.push(text);
      },
      onTool: () => undefined,
    });
    assert.equal(chunks.join(""), "Edited invoices.");
    assert.match(diff, /nextCursor: null/);
    await harness.cancel("sess_demo");
  } finally {
    harness.stop();
    for (const socket of sockets) socket.destroy();
    server.close();
  }
});
