import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { brandCodeServer } from "./setup-code-server.mjs";
import { CODE_SERVER_VERSION, PACKAGE_TARGETS, codeServerReleaseUrl } from "./targets.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "dist", "release");
const CACHE = path.join(ROOT, "vendor", "cache");

function version() {
  const fromEnv = process.env.SUBSPACES_VERSION || "";
  if (fromEnv) return String(fromEnv).replace(/^v/, "");
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return String(pkg.version || "0.1.0");
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execFileSync("curl", ["-fL", "--retry", "3", "-o", dest, url], { stdio: "inherit" });
}

function copyTree(from, to) {
  fs.cpSync(from, to, {
    recursive: true,
    verbatimSymlinks: true,
    filter(source) {
      const base = path.basename(source);
      if (base === "node_modules" || base === ".env" || base === ".env.local" || base === ".git") return false;
      return true;
    },
  });
}

function assertNoSecrets(dir) {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".env" || entry.name === ".env.local") {
        throw new Error(`Refusing to package ${path.join(current, entry.name)}`);
      }
      if (entry.isDirectory() && entry.name !== "node_modules") {
        stack.push(path.join(current, entry.name));
      }
    }
  }
}

const ver = version();
fs.mkdirSync(OUT, { recursive: true });
run("pnpm", ["--filter", "@subspaces/chat-ui", "build"]);

const bundleDir = path.join(ROOT, "dist", "backend-bundle");
fs.rmSync(bundleDir, { recursive: true, force: true });
fs.mkdirSync(bundleDir, { recursive: true });
run("pnpm", [
  "exec",
  "esbuild",
  "apps/backend/src/index.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--target=node22",
  "--outfile=dist/backend-bundle/server.mjs",
  "--legal-comments=none",
]);

for (const target of PACKAGE_TARGETS) {
  const stageRoot = path.join(ROOT, "dist", "stage", target.id);
  const appRoot = path.join(stageRoot, "subspaces-si");
  fs.rmSync(stageRoot, { recursive: true, force: true });
  fs.mkdirSync(appRoot, { recursive: true });

  fs.mkdirSync(path.join(appRoot, "apps", "backend"), { recursive: true });
  fs.copyFileSync(path.join(bundleDir, "server.mjs"), path.join(appRoot, "apps", "backend", "server.mjs"));
  copyTree(path.join(ROOT, "apps", "extension"), path.join(appRoot, "apps", "extension"));
  copyTree(path.join(ROOT, "examples", "tallyhouse-api"), path.join(appRoot, "examples", "tallyhouse-api"));
  fs.mkdirSync(path.join(appRoot, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "scripts", "setup-opencode.mjs"), path.join(appRoot, "scripts", "setup-opencode.mjs"));
  fs.copyFileSync(path.join(ROOT, "scripts", "targets.mjs"), path.join(appRoot, "scripts", "targets.mjs"));
  fs.copyFileSync(path.join(ROOT, ".env.example"), path.join(appRoot, ".env.example"));
  const start = path.join(appRoot, "start");
  fs.copyFileSync(path.join(ROOT, "scripts", "ide-start.sh"), start);
  fs.chmodSync(start, 0o755);

  const tarballName = `code-server-${CODE_SERVER_VERSION}-${target.codeServerArch}.tar.gz`;
  const cached = path.join(CACHE, tarballName);
  const legacy = path.join(ROOT, "vendor", tarballName);
  if (!fs.existsSync(cached) && fs.existsSync(legacy)) {
    fs.mkdirSync(CACHE, { recursive: true });
    fs.copyFileSync(legacy, cached);
  }
  download(codeServerReleaseUrl(target.codeServerArch), cached);

  const extractAt = path.join(stageRoot, "extract");
  fs.mkdirSync(extractAt, { recursive: true });
  execFileSync("tar", ["-C", extractAt, "-xzf", cached], { stdio: "inherit" });
  const extracted = fs.readdirSync(extractAt).find((name) => name.startsWith("code-server-"));
  if (!extracted) throw new Error(`code-server archive for ${target.id} had no install folder.`);
  const install = path.join(appRoot, "vendor", "code-server");
  fs.mkdirSync(path.dirname(install), { recursive: true });
  fs.renameSync(path.join(extractAt, extracted), install);
  brandCodeServer(install);
  fs.chmodSync(path.join(install, "bin", "code-server"), 0o755);

  assertNoSecrets(appRoot);
  const archive = path.join(OUT, `subspaces-si-${ver}-${target.id}.tar.gz`);
  execFileSync("tar", ["-C", stageRoot, "-czf", archive, "subspaces-si"], { stdio: "inherit" });
  console.log(archive);
}
