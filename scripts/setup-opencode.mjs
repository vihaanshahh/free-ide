import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { OPENCODE_VERSION, opencodeReleaseUrl, targetFor } from "./targets.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RUNTIME = path.join(ROOT, "vendor", "opencode-runtime");

export { OPENCODE_VERSION };

export function opencodeBin() {
  return path.join(RUNTIME, "opencode");
}

export function setupOpencode() {
  fs.mkdirSync(RUNTIME, { recursive: true });
  const bin = opencodeBin();
  if (!fs.existsSync(bin)) {
    const target = targetFor();
    const archive = path.join(ROOT, "vendor", "cache", target.opencodeAsset);
    if (!fs.existsSync(archive)) {
      fs.mkdirSync(path.dirname(archive), { recursive: true });
      execFileSync("curl", ["-fL", "--retry", "3", "-o", archive, opencodeReleaseUrl(target.opencodeAsset)], { stdio: "inherit" });
    }
    extractArchive(archive, RUNTIME);
    placeBinary(RUNTIME);
  }
  fs.chmodSync(bin, 0o755);
  const version = execFileSync(bin, ["--version"], { encoding: "utf8" }).trim();
  if (version !== OPENCODE_VERSION) {
    throw new Error(`opencode binary is ${version}, expected ${OPENCODE_VERSION}.`);
  }
  return bin;
}

function extractArchive(archive, dest) {
  if (archive.endsWith(".zip")) {
    execFileSync("unzip", ["-o", archive, "-d", dest], { stdio: "inherit" });
    return;
  }
  execFileSync("tar", ["-C", dest, "-xzf", archive], { stdio: "inherit" });
}

function placeBinary(dest) {
  const direct = path.join(dest, "opencode");
  if (fs.existsSync(direct)) return;
  const nested = fs.readdirSync(dest, { recursive: true }).find((entry) => path.basename(String(entry)) === "opencode");
  if (!nested) throw new Error("The opencode archive did not contain an opencode binary.");
  fs.renameSync(path.join(dest, String(nested)), direct);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bin = setupOpencode();
  console.log(`opencode ${OPENCODE_VERSION} at ${bin}`);
}
