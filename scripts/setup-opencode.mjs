import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
export const OPENCODE_VERSION = "1.18.27";
const RUNTIME = path.join(ROOT, "vendor", "opencode-runtime");
const TARBALL = path.join(ROOT, "vendor", `opencode-linux-x64-${OPENCODE_VERSION}.tar.gz`);
const RELEASE = `https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-x64.tar.gz`;

export function opencodeBin() {
  return path.join(RUNTIME, "opencode");
}

export function setupOpencode() {
  fs.mkdirSync(RUNTIME, { recursive: true });
  const bin = opencodeBin();
  if (!fs.existsSync(bin)) {
    if (!fs.existsSync(TARBALL)) {
      execFileSync("curl", ["-fL", "--retry", "3", "-o", TARBALL, RELEASE], { stdio: "inherit" });
    }
    execFileSync("tar", ["-C", RUNTIME, "-xzf", TARBALL], { stdio: "inherit" });
  }
  const version = execFileSync(bin, ["--version"], { encoding: "utf8" }).trim();
  if (version !== OPENCODE_VERSION) {
    throw new Error(`opencode binary is ${version}, expected ${OPENCODE_VERSION}.`);
  }
  return bin;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bin = setupOpencode();
  console.log(`opencode ${OPENCODE_VERSION} at ${bin}`);
}
