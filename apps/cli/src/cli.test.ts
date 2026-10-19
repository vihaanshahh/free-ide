import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cardFromAdsPayload, MOCK_BELOW_CARD, renderSponsoredCard } from "./ad-card.ts";
import { STARTING_TOKENS } from "./balance.ts";
import { main, parseArgs, type Io } from "./cli.ts";
import {
  buildOpencodeConfig,
  DEFAULT_API,
  FALLBACK_MODEL_ID,
  FALLBACK_MODEL_NAME,
  OPENCODE_VERSION,
  PRIMARY_MODEL_ID,
  PRIMARY_MODEL_NAME,
  resolveApi,
  writeOpencodeConfig,
  type OpencodeConfig,
} from "./config.ts";
import type { LaunchRequest } from "./launch.ts";

test("opencode config points both Flash models at the subspaces proxy", () => {
  const body = buildOpencodeConfig(DEFAULT_API);
  assert.equal(body.model, `subspaces/${PRIMARY_MODEL_ID}`);
  assert.equal(body.small_model, `subspaces/${PRIMARY_MODEL_ID}`);
  assert.equal(body.autoupdate, false);
  assert.deepEqual(body.enabled_providers, ["subspaces"]);
  assert.equal(body.provider.subspaces.npm, "@ai-sdk/openai-compatible");
  assert.equal(body.provider.subspaces.options.baseURL, DEFAULT_API);
  assert.equal(body.provider.subspaces.models[PRIMARY_MODEL_ID].name, PRIMARY_MODEL_NAME);
  assert.equal(body.provider.subspaces.models[PRIMARY_MODEL_ID].tool_call, true);
  assert.equal(body.provider.subspaces.models[FALLBACK_MODEL_ID].name, FALLBACK_MODEL_NAME);
  assert.equal(body.provider.subspaces.models[FALLBACK_MODEL_ID].tool_call, true);
  assert.equal(resolveApi({}), DEFAULT_API);
  assert.equal(resolveApi({ SUBSPACES_API: "https://example.test/v1/" }), "https://example.test/v1");
  assert.equal(resolveApi({ SUBSPACES_API: "https://example.test" }), "https://example.test/v1");
});

test("writeOpencodeConfig stores the generated provider file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subspaces-config-"));
  const file = writeOpencodeConfig(path.join(dir, "nested", "opencode.json"), "http://127.0.0.1:41824/v1");
  const body = JSON.parse(fs.readFileSync(file, "utf8")) as OpencodeConfig;
  assert.equal(body.provider.subspaces.options.baseURL, "http://127.0.0.1:41824/v1");
  assert.equal(body.$schema, "https://opencode.ai/config.json");
});

test("sponsored card is one bordered box with a label, title, line, and link", () => {
  const card = renderSponsoredCard(MOCK_BELOW_CARD);
  const lines = card.split("\n");
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^╭ Sponsored · Quillfern /);
  assert.match(lines[0], /╮$/);
  assert.equal(lines[1].includes(MOCK_BELOW_CARD.title), true);
  assert.equal(lines[2].includes(MOCK_BELOW_CARD.line), true);
  assert.equal(lines[2].includes("\n"), false);
  assert.equal(lines[3].includes(MOCK_BELOW_CARD.url), true);
  assert.match(lines[4], /^╰─+╯$/);
  const widths = lines.map((line) => visible(line).length);
  assert.equal(new Set(widths).size, 1);
  assert.equal(card.includes("\u001b["), false);
});

test("colored card keeps a rectangle and clips a long line", () => {
  const card = renderSponsoredCard(
    {
      brand: "Quillfern",
      title: "A live URL for every pull request",
      line: "Preview this pagination change before review starts and then keep going past the box.",
      url: "https://example.com/quillfern",
    },
    { color: true, innerWidth: 36 },
  );
  const lines = card.split("\n");
  const widths = lines.map((line) => visible(line).length);
  assert.equal(new Set(widths).size, 1);
  assert.match(visible(lines[0]), /Sponsored/);
  assert.match(visible(lines[2]), /…/);
  assert.equal(visible(lines[2]).includes("keep going past"), false);
  assert.match(card, /\u001b\[38;2;/);
});

test("ad payloads from /api/ads become a card", () => {
  const fromBelow = cardFromAdsPayload({
    ad: {
      title: "Gravity test",
      adText: "One line of copy.",
      url: "https://example.com/ad",
      brandName: "Gravity",
    },
  });
  assert.deepEqual(fromBelow, {
    brand: "Gravity",
    title: "Gravity test",
    line: "One line of copy.",
    url: "https://example.com/ad",
  });
  const fromList = cardFromAdsPayload({
    ads: [{ title: "Sidebar", adText: "Logs.", clickUrl: "https://example.com/logs", brandName: "Lanternlog" }],
  });
  assert.equal(fromList?.title, "Sidebar");
  assert.equal(fromList?.url, "https://example.com/logs");
  assert.equal(cardFromAdsPayload({ ad: { placement: "below_response" } }), null);
});

test("mock run writes the opencode config, a diff, and a card without launching", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "subspaces-run-"));
  const io = fakeIo(home);
  const code = await main(["run", "add pagination to listInvoices"], io);
  const text = io.out.join("");
  assert.equal(code, 0);
  assert.equal(io.launched.length, 0);
  assert.equal(io.fetched, 0);
  assert.match(text, /subspaces\.si/);
  assert.match(text, /GLM-5\.3-Flash/);
  assert.match(text, /opencode v1\.18\.27 {2}· {2}mock/);
  assert.match(text, /--- a\/src\/routes\/invoices\.ts/);
  assert.match(text, /\+ {2}const limit = Math\.min\(query\.limit \?\? 20, 100\);/);
  assert.match(text, /Sponsored · Quillfern/);
  assert.match(text, /https:\/\/example\.com\/quillfern/);
  const config = JSON.parse(fs.readFileSync(path.join(home, "opencode.json"), "utf8")) as OpencodeConfig;
  assert.equal(config.provider.subspaces.options.baseURL, DEFAULT_API);
  assert.equal(config.model, `subspaces/${PRIMARY_MODEL_ID}`);
  const balance = JSON.parse(fs.readFileSync(path.join(home, "balance.json"), "utf8")) as { tokensLeft: number };
  assert.equal(balance.tokensLeft < STARTING_TOKENS, true);
  const after = await main(["balance"], io);
  assert.equal(after, 0);
  assert.match(io.out.join(""), /tokens left/);
});

test("an unreachable proxy uses the canned reply", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "subspaces-offline-"));
  const io = fakeIo(home);
  delete io.env.SUBSPACES_MOCK;
  io.fetch = async () => {
    io.fetched += 1;
    throw new Error("network down");
  };
  const code = await main(["run", "add pagination to listInvoices"], io);
  assert.equal(code, 0);
  assert.equal(io.fetched, 1);
  assert.equal(io.launched.length, 0);
  assert.match(io.out.join(""), /nextCursor/);
});

test("live run launches opencode and prints the /api/ads card", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "subspaces-live-"));
  const io = fakeIo(home);
  io.env.SUBSPACES_MOCK = "0";
  io.env.SUBSPACES_API = "https://subspaces.example/v1";
  io.env.OPENCODE_BIN = "/tmp/opencode-test-bin";
  io.env.GRAVITY_API_KEY = "do-not-forward";
  io.env.LLM_API_KEY = "do-not-forward";
  io.env.PATH = "/usr/bin";
  io.exists = (file) => file === "/tmp/opencode-test-bin";
  io.fetch = async (url) => {
    io.fetched += 1;
    if (url.endsWith("/api/ads")) {
      return Response.json({
        ad: { title: "From the proxy", adText: "Filled by /api/ads.", url: "https://example.com/live", brandName: "Quillfern" },
      });
    }
    return new Response("missing", { status: 404 });
  };
  const code = await main(["run", "rename the helper"], io);
  assert.equal(code, 0);
  assert.equal(io.launched.length, 1);
  const launch = io.launched[0];
  assert.equal(launch.bin, "/tmp/opencode-test-bin");
  assert.deepEqual(launch.args, ["run", "--model", "subspaces/glm-5.3-flash", "--auto", "--format", "default", "rename the helper"]);
  assert.equal(launch.env.OPENCODE_CONFIG, path.join(home, "opencode.json"));
  assert.equal(launch.env.SUBSPACES_PROVIDER_KEY, "subspaces-local");
  assert.equal(launch.env.GRAVITY_API_KEY, undefined);
  assert.equal(launch.env.LLM_API_KEY, undefined);
  assert.equal(launch.env.PATH, "/usr/bin");
  assert.match(io.out.join(""), /From the proxy/);
  assert.match(io.out.join(""), /https:\/\/example\.com\/live/);
  const config = JSON.parse(fs.readFileSync(path.join(home, "opencode.json"), "utf8")) as OpencodeConfig;
  assert.equal(config.provider.subspaces.options.baseURL, "https://subspaces.example/v1");
});

test("watch-ad counts down and unlocks 15k tokens", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "subspaces-ad-"));
  const io = fakeIo(home);
  io.env.SUBSPACES_AD_SECONDS = "2";
  const code = await main(["watch-ad"], io);
  const text = io.out.join("");
  assert.equal(code, 0);
  assert.equal(io.fetched, 0);
  assert.match(text, /Sponsored/);
  assert.match(text, /watching {2}2s/);
  assert.match(text, /watching {2}1s/);
  assert.match(text, /\+15k tokens unlocked/);
  assert.match(text, /tokens left {2}65,000/);
  assert.equal(io.slept, 2);
});

test("login is a stub and does not print a credential", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "subspaces-login-"));
  const io = fakeIo(home);
  io.env.GRAVITY_API_KEY = "super-secret-value";
  const code = await main(["login"], io);
  const text = io.out.join("");
  assert.equal(code, 0);
  assert.match(text, /stub/);
  assert.equal(text.includes("super-secret-value"), false);
  assert.equal(text.includes("GRAVITY"), false);
});

test("missing opencode binary is reported when mock mode is off", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "subspaces-missing-"));
  const io = fakeIo(home);
  io.env.SUBSPACES_MOCK = "0";
  const code = await main(["run", "hello"], io);
  assert.equal(code, 1);
  assert.match(io.err.join(""), new RegExp(`opencode v${OPENCODE_VERSION}`));
  assert.equal(io.launched.length, 0);
});

test("parseArgs covers the command set", () => {
  assert.equal(parseArgs([]).kind, "interactive");
  assert.equal(parseArgs(["run"]).kind, "error");
  assert.deepEqual(parseArgs(["run", "add", "pagination"]), { kind: "run", prompt: "add pagination" });
  assert.equal(parseArgs(["watch-ad"]).kind, "watch-ad");
  assert.equal(parseArgs(["nope"]).kind, "unknown");
});

function visible(line: string): string {
  return line.replace(/\u001b\[[0-9;]*m/g, "");
}

function fakeIo(home: string): Io & { out: string[]; err: string[]; launched: LaunchRequest[]; fetched: number; slept: number } {
  const io = {
    env: { SUBSPACES_MOCK: "1", SUBSPACES_HOME: home, NO_COLOR: "1", HOME: home } as NodeJS.ProcessEnv,
    cwd: home,
    stdin: new AbortController().signal as unknown as NodeJS.ReadableStream,
    stdoutStream: new Writable(),
    stdinIsTTY: false,
    stdoutIsTTY: false,
    fetched: 0,
    slept: 0,
    out: [] as string[],
    err: [] as string[],
    launched: [] as LaunchRequest[],
    fetch: async () => {
      io.fetched += 1;
      return new Response("ok", { status: 200 });
    },
    sleep: async () => {
      io.slept += 1;
    },
    launch: async (request: LaunchRequest) => {
      io.launched.push(request);
      return 0;
    },
    exists: () => false,
    writeOut: (text: string) => {
      io.out.push(text);
    },
    writeErr: (text: string) => {
      io.err.push(text);
    },
  };
  return io;
}

class Writable {
  write() {
    return true;
  }
}
