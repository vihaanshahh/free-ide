import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  PUBLIC_DOWNLOAD_BASE,
  PUBLIC_RELEASE_REPO,
  RELEASE_TARGETS,
  buildManifest,
  selectArchives,
  targetById,
} from "./release-assets.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RELEASE_DIR = path.join(ROOT, "dist", "release");

export function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function warn(message) {
  console.log(`::warning::${message}`);
}

function redact(text, token) {
  if (!token) return text;
  return text.split(token).join("[redacted]");
}

function gh(args, token) {
  const result = spawnSync("gh", args, {
    env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token },
    encoding: "utf8",
  });
  const output = redact(`${result.stdout || ""}${result.stderr || ""}`, token).trim();
  return { ok: result.status === 0, output };
}

function requireGh(args, token) {
  const result = gh(args, token);
  if (!result.ok) {
    throw new Error(result.output || `gh ${args[0]} failed`);
  }
  return result.output;
}

export function stagePublicAssets(releaseDir, stageDir) {
  const names = fs.readdirSync(releaseDir);
  const selected = selectArchives(names);
  if (selected.missing.length) {
    throw new Error(
      `Missing archives for ${selected.missing.join(", ")} in ${releaseDir}. Expected subspaces-si-<version>-<target>.tar.gz.`,
    );
  }
  if (selected.versions.length !== 1) {
    throw new Error(`Archive versions disagree (${selected.versions.join(", ")}). Publish one tag at a time.`);
  }
  fs.mkdirSync(stageDir, { recursive: true });
  const assets = [];
  for (const target of RELEASE_TARGETS) {
    const source = selected.chosen.get(target.id);
    const from = path.join(releaseDir, source.file);
    const dest = path.join(stageDir, target.file);
    fs.copyFileSync(from, dest);
    assets.push({
      id: target.id,
      label: target.label,
      file: target.file,
      size: fs.statSync(dest).size,
      sha256: sha256File(dest),
    });
  }
  return { version: selected.version, assets };
}

function publish() {
  const token = process.env.RELEASES_REPO_TOKEN || "";
  if (!token.trim()) {
    warn(
      "RELEASES_REPO_TOKEN is not set. Skipping the public download upload. Create the public repo vihaanshahh/subspaces-releases, add a fine-grained PAT as this Actions secret, and re-run the workflow. Nothing was billed.",
    );
    return;
  }

  if (!fs.existsSync(RELEASE_DIR)) {
    throw new Error(`No ${RELEASE_DIR}. Package or download the private release assets first.`);
  }

  const repo = process.env.RELEASES_REPO || PUBLIC_RELEASE_REPO;
  const stageDir = path.join(ROOT, "dist", "public-release");
  fs.rmSync(stageDir, { recursive: true, force: true });
  const staged = stagePublicAssets(RELEASE_DIR, stageDir);
  const tag = (process.env.SUBSPACES_TAG || `v${staged.version}`).trim();
  if (!/^v\d/.test(tag)) throw new Error(`Refusing tag ${tag}. Expected a v* tag such as v0.1.0.`);

  const baseUrl = PUBLIC_DOWNLOAD_BASE.replace(PUBLIC_RELEASE_REPO, repo);
  const manifest = buildManifest({
    version: staged.version,
    tag,
    baseUrl,
    assets: staged.assets,
  });
  const manifestPath = path.join(stageDir, "latest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const view = gh(["release", "view", tag, "--repo", repo], token);
  const notes = [
    `subspaces.si ${tag}`,
    "",
    "Free public downloads. These archives are not served from Vercel.",
    "",
    ...manifest.assets.map((asset) => `- ${asset.label}: ${asset.file} (${asset.size} bytes)`),
  ].join("\n");

  if (!view.ok) {
    requireGh(
      ["release", "create", tag, "--repo", repo, "--title", `subspaces.si ${tag}`, "--notes", notes, "--latest"],
      token,
    );
  } else {
    requireGh(["release", "edit", tag, "--repo", repo, "--latest", "--notes", notes], token);
  }

  const uploads = [...manifest.assets.map((asset) => path.join(stageDir, asset.file)), manifestPath];
  requireGh(["release", "upload", tag, "--repo", repo, "--clobber", ...uploads], token);
  console.log(`Published ${tag} to ${repo} (${staged.assets.length} archives + latest.json).`);
  for (const asset of manifest.assets) {
    const known = targetById(asset.id);
    console.log(`${known ? known.label : asset.id} ${asset.url}`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    publish();
  } catch (error) {
    const token = process.env.RELEASES_REPO_TOKEN || "";
    const message = error instanceof Error ? error.message : String(error);
    console.error(redact(message, token));
    process.exit(1);
  }
}
