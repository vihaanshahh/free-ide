import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { codeServerBin, setup } from "./setup-code-server.mjs";
import { opencodeBin, setupOpencode } from "./setup-opencode.mjs";

loadLocalEnv(path.resolve(import.meta.dirname, "../.env"));

const ROOT = path.resolve(import.meta.dirname, "..");
const IDE_PORT = process.env.SUBSPACES_IDE_PORT || "41823";
const API_PORT = process.env.SUBSPACES_API_PORT || "41824";
const LANDING_PORT = process.env.SUBSPACES_LANDING_PORT || "41825";

setup();
setupOpencode();

const build = spawnSync("pnpm", ["--filter", "@subspaces/chat-ui", "build"], {
  cwd: ROOT,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

const userDir = path.join(ROOT, ".subspaces", "user-data");
const extDir = path.join(ROOT, ".subspaces", "extensions");
fs.mkdirSync(path.join(userDir, "User"), { recursive: true });
fs.mkdirSync(extDir, { recursive: true });
fs.writeFileSync(
  path.join(userDir, "User", "settings.json"),
  `${JSON.stringify(
    {
      "workbench.colorTheme": "subspaces Dark",
      "workbench.startupEditor": "none",
      "workbench.welcomePage.walkthroughs.openOnInstall": false,
      "security.workspace.trust.enabled": false,
      "window.title": "${dirty}${activeEditorShort}${separator}${rootName}${separator}subspaces.si",
      "window.autoDetectColorScheme": false,
      "telemetry.telemetryLevel": "off",
      "update.mode": "none",
      "workbench.tips.enabled": false,
      "workbench.secondarySideBar.defaultVisibility": "visible",
      "editor.fontFamily": "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      "editor.fontSize": 13,
      "editor.lineHeight": 20,
      "terminal.integrated.fontFamily": "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      "chat.disableAIFeatures": true,
      "extensions.ignoreRecommendations": true,
      "workbench.editor.enablePreview": false,
    },
    null,
    2,
  )}\n`,
);

const configPath = path.join(ROOT, ".subspaces", "config.yaml");
fs.writeFileSync(
  configPath,
  [
    `bind-addr: 127.0.0.1:${IDE_PORT}`,
    "auth: none",
    "disable-telemetry: true",
    "disable-update-check: true",
    "disable-workspace-trust: true",
    "disable-getting-started-override: true",
    "app-name: subspaces.si",
    "",
  ].join("\n"),
);

const extensionLink = path.join(extDir, "subspaces.subspaces-chat-0.1.0");
fs.rmSync(extensionLink, { recursive: true, force: true });
fs.symlinkSync(path.join(ROOT, "apps", "extension"), extensionLink, "dir");

const children = [];

function launch(command, args, extraEnv) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) console.error(`${command} exited ${code}`);
  });
}

launch("pnpm", ["--filter", "@subspaces/backend", "dev"], {
  SUBSPACES_API_PORT: API_PORT,
  OPENCODE_BIN: opencodeBin(),
  OPENCODE_PORT: process.env.OPENCODE_PORT || "41826",
  SUBSPACES_WORKSPACE: path.join(ROOT, "examples", "tallyhouse-api"),
});

launch("pnpm", ["--filter", "@subspaces/landing", "dev"], {
  SUBSPACES_LANDING_PORT: LANDING_PORT,
});

launch(
  codeServerBin(),
  [
    "--config",
    configPath,
    "--auth",
    "none",
    "--bind-addr",
    `127.0.0.1:${IDE_PORT}`,
    "--disable-telemetry",
    "--disable-update-check",
    "--disable-workspace-trust",
    "--disable-getting-started-override",
    "--ignore-last-opened",
    "--app-name",
    "subspaces.si",
    "--user-data-dir",
    userDir,
    "--extensions-dir",
    extDir,
    "--vscode-option",
    "disable-extension=GitHub.copilot-chat",
    path.join(ROOT, "examples", "tallyhouse-api"),
  ],
  {
    SUBSPACES_API_PORT: API_PORT,
    SUBSPACES_API_ORIGIN: `http://127.0.0.1:${API_PORT}`,
  },
);

console.log(`\nlanding       http://127.0.0.1:${LANDING_PORT}`);
console.log(`subspaces.si  http://127.0.0.1:${IDE_PORT}`);
console.log(`proxy         http://127.0.0.1:${API_PORT}\n`);

function loadLocalEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function shutdown() {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
