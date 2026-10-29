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
    const dest = path.join(stageDir, source.file);
    fs.copyFileSync(from, dest);
    assets.push({
      id: target.id,
      label: target.label,
      file: source.file,
      size: fs.statSync(dest).size,
      sha256: sha256File(dest),
    });
  }
  const sums = `${assets.map((asset) => `${asset.sha256}  ${asset.file}`).join("\n")}\n`;
  fs.writeFileSync(path.join(stageDir, "SHA256SUMS"), sums);
  return { version: selected.version, assets };
}

export function releaseTitle(tag, version) {
  if (tag.includes("beta")) return `subspaces.si ${version} beta`;
  return `subspaces.si ${tag}`;
}

/** The private v0.1.0 tag is published publicly as a normal (not prerelease) beta tag. */
export function publicTag(tag) {
  if (tag === "v0.1.0") return "v0.1.0-beta";
  return tag;
}

/**
 * `gh release view` on a missing tag is "missing" (create it).
 * 403 / permission text is "denied" so the caller can try another token.
 * A 404 that also says the integration cannot access the repo is "denied".
 */
export function classifyReleaseView(output) {
  const text = output || "";
  if (/release not found/i.test(text)) return "missing";
  if (/403|Resource not accessible|Permission|denied|not accessible/i.test(text)) return "denied";
  if (/404|not found/i.test(text)) return "missing";
  return "error";
}

function uploadRelease(token, repo, tag, title, notes, files) {
  const view = gh(["release", "view", tag, "--repo", repo], token);
  if (!view.ok) {
    const kind = classifyReleaseView(view.output);
    if (kind !== "missing") throw new Error(view.output || "gh release view failed");
    requireGh(
      ["release", "create", tag, "--repo", repo, "--title", title, "--notes", notes, "--latest"],
      token,
    );
  } else {
    requireGh(["release", "edit", tag, "--repo", repo, "--latest", "--notes", notes, "--title", title], token);
  }
  requireGh(["release", "upload", tag, "--repo", repo, "--clobber", ...files], token);
}

function publish() {
  const token = (process.env.RELEASES_REPO_TOKEN || "").trim();
  if (!token) throw new Error("RELEASES_REPO_TOKEN is required to publish public downloads.");
  if (!fs.existsSync(RELEASE_DIR)) {
    throw new Error(`No ${RELEASE_DIR}. Package or download the private release assets first.`);
  }

  const repo = process.env.RELEASES_REPO || PUBLIC_RELEASE_REPO;
  const stageDir = path.join(ROOT, "dist", "public-release");
  fs.rmSync(stageDir, { recursive: true, force: true });
  const staged = stagePublicAssets(RELEASE_DIR, stageDir);
  const tag = publicTag((process.env.SUBSPACES_TAG || `v${staged.version}`).trim());
  if (!/^v\d/.test(tag)) throw new Error(`Refusing tag ${tag}. Expected a v* tag such as v0.1.0.`);

  const baseUrl = PUBLIC_DOWNLOAD_BASE.replace(PUBLIC_RELEASE_REPO, repo);
  const manifest = buildManifest({
    version: staged.version,
    tag,
    baseUrl,
    assets: staged.assets,
  });
  const notes = [
    releaseTitle(tag, staged.version),
    "",
    "Free public downloads. These archives are not served from Vercel.",
    "",
    ...manifest.assets.map((asset) => `- ${asset.label}: ${asset.file} (${asset.size} bytes)`),
  ].join("\n");
  const files = [...manifest.assets.map((asset) => path.join(stageDir, asset.file)), path.join(stageDir, "SHA256SUMS")];
  const title = releaseTitle(tag, staged.version);

  uploadRelease(token, repo, tag, title, notes, files);
  console.log(`Published ${tag} to ${repo} (${staged.assets.length} archives + SHA256SUMS).`);
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
