#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { loadSponsoredCard, MOCK_BELOW_CARD, renderSponsoredCard, type FetchLike } from "./ad-card.ts";
import { renderBanner } from "./banner.ts";
import {
  balancePath,
  charge,
  formatTokens,
  loadBalance,
  renderBalance,
  saveBalance,
  unlock,
} from "./balance.ts";
import {
  configPathFor,
  DEFAULT_API,
  hostedApi,
  OPENCODE_VERSION,
  opencodeEnv,
  PRIMARY_MODEL_ID,
  resolveApi,
  writeOpencodeConfig,
} from "./config.ts";
import {
  adSeconds,
  decideMode,
  launchOpencode,
  resolveOpencodeBin,
  runArgs,
  subspacesHome,
  tuiArgs,
  type LaunchRequest,
} from "./launch.ts";
import { colorizeReply, estimateTokens, mockReply } from "./reply.ts";
import { refreshHostedSession } from "./session.ts";
import { paint, useColor, type Paint } from "./style.ts";

const CLI_VERSION = "0.1.0";

export interface Io {
  env: NodeJS.ProcessEnv;
  cwd: string;
  stdin: NodeJS.ReadableStream;
  stdoutStream: NodeJS.WritableStream;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  launch: (request: LaunchRequest) => Promise<number>;
  exists: (file: string) => boolean;
  writeOut: (text: string) => void;
  writeErr: (text: string) => void;
}

export type Command =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "login" }
  | { kind: "balance" }
  | { kind: "watch-ad" }
  | { kind: "run"; prompt: string }
  | { kind: "interactive" }
  | { kind: "unknown"; name: string }
  | { kind: "error"; message: string };

export function parseArgs(argv: string[]): Command {
  const [first, ...rest] = argv;
  if (!first || first === "tui") return { kind: "interactive" };
  if (first === "help" || first === "--help" || first === "-h") return { kind: "help" };
  if (first === "version" || first === "--version" || first === "-v") return { kind: "version" };
  if (first === "login") return { kind: "login" };
  if (first === "balance") return { kind: "balance" };
  if (first === "watch-ad") return { kind: "watch-ad" };
  if (first === "run") {
    const prompt = rest.join(" ").trim();
    if (!prompt) return { kind: "error", message: 'subspaces run needs a prompt.\n' };
    return { kind: "run", prompt };
  }
  if (first.startsWith("-")) return { kind: "unknown", name: first };
  return { kind: "unknown", name: first };
}

export function helpText(): string {
  return `subspaces.si  ·  free, ad-funded coding

Usage
  subspaces                         interactive opencode
  subspaces run "<prompt>"          one reply, then a sponsored card
  subspaces login                   account stub
  subspaces balance                 hosted or local demo balance
  subspaces watch-ad                local demo reward only

Environment
  SUBSPACES_API       OpenAI-compatible proxy (default ${DEFAULT_API})
  SUBSPACES_MOCK=1    canned replies, no network
  OPENCODE_BIN        pinned opencode ${OPENCODE_VERSION} binary

Built on opencode v${OPENCODE_VERSION} (MIT). This wrapper does not fork it.
`;
}

export function defaultIo(): Io {
  return {
    env: process.env,
    cwd: process.cwd(),
    stdin: process.stdin,
    stdoutStream: process.stdout,
    stdinIsTTY: Boolean(process.stdin.isTTY),
    stdoutIsTTY: Boolean(process.stdout.isTTY),
    fetch: globalThis.fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    launch: launchOpencode,
    exists: fs.existsSync,
    writeOut: (text) => {
      process.stdout.write(text);
    },
    writeErr: (text) => {
      process.stderr.write(text);
    },
  };
}

export async function main(argv: string[], io: Io = defaultIo()): Promise<number> {
  const command = parseArgs(argv);
  switch (command.kind) {
    case "help":
      io.writeOut(helpText());
      return 0;
    case "version":
      io.writeOut(`subspaces ${CLI_VERSION} (opencode v${OPENCODE_VERSION})\n`);
      return 0;
    case "login":
      return commandLogin(io);
    case "balance":
      return commandBalance(io);
    case "watch-ad":
      return commandWatchAd(io);
    case "run":
      return commandRun(command.prompt, io);
    case "interactive":
      return commandInteractive(io);
    case "error":
      io.writeErr(command.message);
      return 1;
    case "unknown":
      io.writeErr(`Unknown command ${command.name}\n\n${helpText()}`);
      return 1;
    default:
      return 1;
  }
}

function commandLogin(io: Io): number {
  const p = colors(io);
  io.writeOut(`${header(p)}\n\nlogin is a stub\n\nGitHub OAuth is not connected in this build.\nNo account is created, and no token is stored.\nYou can use subspaces without signing in.\n`);
  return 0;
}

async function commandBalance(io: Io): Promise<number> {
  const p = colors(io);
  const mode = await decideMode(io.env, io.fetch);
  const api = resolveApi(io.env);
  if (mode === "live" && hostedApi(api)) {
    try {
      const session = await refreshHostedSession(api, subspacesHome(io.env), io.fetch);
      io.writeOut(`${header(p)}\n\ntokens left  ${p.cream(formatTokens(session.balance))}\nsource       hosted API\n`);
      return 0;
    } catch (error) {
      io.writeErr(`${error instanceof Error ? error.message : "Hosted session is unavailable."}\n`);
      return 1;
    }
  }
  const balance = loadBalance(balancePath(subspacesHome(io.env)));
  io.writeOut(`${header(p)}\n\n${renderBalance(balance, p)}\nsource       local demo\n`);
  return 0;
}

async function commandWatchAd(io: Io): Promise<number> {
  const p = colors(io);
  const mode = await decideMode(io.env, io.fetch);
  const api = resolveApi(io.env);
  if (mode === "live" && hostedApi(api)) {
    io.writeErr("Hosted ad rewards are unavailable until the ad provider supplies server-confirmed proof. No tokens were added.\n");
    return 1;
  }
  const card = mode === "mock" ? MOCK_BELOW_CARD : await loadSponsoredCard(api, io.fetch);
  io.writeOut(`${header(p)}\n\n${renderSponsoredCard(card, { color: p.enabled })}\n`);
  const seconds = adSeconds(io.env);
  for (let left = seconds; left >= 1; left -= 1) {
    io.writeOut(`${p.sage(`watching  ${left}s`)}\n`);
    await io.sleep(1000);
  }
  const file = balancePath(subspacesHome(io.env));
  const next = unlock(loadBalance(file));
  saveBalance(file, next);
  io.writeOut(`${p.keylime("+15k tokens unlocked")}\n`);
  io.writeOut(`tokens left  ${p.cream(formatTokens(next.tokensLeft))}\n`);
  return 0;
}

async function commandRun(prompt: string, io: Io): Promise<number> {
  const p = colors(io);
  const mode = await decideMode(io.env, io.fetch);
  const api = resolveApi(io.env);
  const home = subspacesHome(io.env);
  io.writeOut(`${renderBanner(p, mode)}\n\n${p.sage("› ")}${p.cream(prompt)}\n\n`);

  if (mode === "mock") {
    writeOpencodeConfig(configPathFor(home), api);
    const reply = mockReply(prompt);
    io.writeOut(`${colorizeReply(reply, p)}\n\n`);
    io.writeOut(`${renderSponsoredCard(MOCK_BELOW_CARD, { color: p.enabled })}\n`);
    const file = balancePath(home);
    saveBalance(file, charge(loadBalance(file), estimateTokens(reply)));
    return 0;
  }

  const bin = resolveOpencodeBin(io.env);
  if (!io.exists(bin)) {
    io.writeErr(
      `opencode v${OPENCODE_VERSION} binary was not found at ${bin}\nRun pnpm setup to download the pinned release.\n`,
    );
    return 1;
  }
  let providerKey: string | undefined;
  if (hostedApi(api)) {
    try {
      const session = await refreshHostedSession(api, home, io.fetch);
      providerKey = session.token;
      if (session.balance < 2049) {
        io.writeErr(`Hosted balance is ${formatTokens(session.balance)} tokens; this reply needs at least 2,049.\n`);
        return 1;
      }
    } catch (error) {
      io.writeErr(`${error instanceof Error ? error.message : "Hosted session is unavailable."}\n`);
      return 1;
    }
  }
  const configFile = writeOpencodeConfig(configPathFor(home), api, providerKey);
  let code: number;
  try {
    code = await io.launch({
      bin,
      args: runArgs(prompt, `subspaces/${PRIMARY_MODEL_ID}`),
      env: opencodeEnv(io.env, home, configFile, providerKey),
      cwd: io.cwd,
    });
  } catch (error) {
    io.writeErr(`${error instanceof Error ? error.message : "opencode failed to start"}\n`);
    return 1;
  }
  if (code !== 0) return code;
  const card = await loadSponsoredCard(api, io.fetch);
  io.writeOut(`\n${renderSponsoredCard(card, { color: p.enabled })}\n`);
  if (!hostedApi(api)) {
    const file = balancePath(home);
    saveBalance(file, charge(loadBalance(file), estimateTokens(prompt) + 256));
  }
  return 0;
}

async function commandInteractive(io: Io): Promise<number> {
  const p = colors(io);
  const mode = await decideMode(io.env, io.fetch);
  const api = resolveApi(io.env);
  const home = subspacesHome(io.env);
  io.writeOut(`${renderBanner(p, mode)}\n\n`);
  if (mode === "mock") {
    writeOpencodeConfig(configPathFor(home), api);
    if (!io.stdinIsTTY) {
      io.writeOut('Mock mode. Pass a prompt with subspaces run "...".\n');
      return 0;
    }
    return mockRepl(io, p, home);
  }
  const bin = resolveOpencodeBin(io.env);
  if (!io.exists(bin)) {
    io.writeErr(
      `opencode v${OPENCODE_VERSION} binary was not found at ${bin}\nRun pnpm setup to download the pinned release.\n`,
    );
    return 1;
  }
  let providerKey: string | undefined;
  if (hostedApi(api)) {
    try {
      const session = await refreshHostedSession(api, home, io.fetch);
      providerKey = session.token;
      if (session.balance < 2049) {
        io.writeErr(`Hosted balance is ${formatTokens(session.balance)} tokens; a reply needs at least 2,049.\n`);
        return 1;
      }
    } catch (error) {
      io.writeErr(`${error instanceof Error ? error.message : "Hosted session is unavailable."}\n`);
      return 1;
    }
  }
  const configFile = writeOpencodeConfig(configPathFor(home), api, providerKey);
  try {
    return await io.launch({
      bin,
      args: tuiArgs(`subspaces/${PRIMARY_MODEL_ID}`),
      env: opencodeEnv(io.env, home, configFile, providerKey),
      cwd: io.cwd,
    });
  } catch (error) {
    io.writeErr(`${error instanceof Error ? error.message : "opencode failed to start"}\n`);
    return 1;
  }
}

async function mockRepl(io: Io, p: Paint, home: string): Promise<number> {
  const rl = readline.createInterface({ input: io.stdin, output: io.stdoutStream, prompt: "› " });
  io.writeOut('Mock mode. Type a prompt, or exit.\n\n');
  rl.prompt();
  for await (const line of rl) {
    const text = String(line).trim();
    if (!text) {
      rl.prompt();
      continue;
    }
    if (text === "exit" || text === "quit") break;
    const reply = mockReply(text);
    io.writeOut(`\n${colorizeReply(reply, p)}\n\n${renderSponsoredCard(MOCK_BELOW_CARD, { color: p.enabled })}\n\n`);
    const file = balancePath(home);
    saveBalance(file, charge(loadBalance(file), estimateTokens(reply)));
    rl.prompt();
  }
  rl.close();
  return 0;
}

function colors(io: Io): Paint {
  return paint(useColor(io.env, io.stdoutIsTTY));
}

function header(p: Paint): string {
  return `${p.sage("subspaces.si")}${p.mint("  ·  free, ad-funded")}`;
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntry) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "subspaces failed");
      process.exit(1);
    });
}
