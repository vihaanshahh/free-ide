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

function denied(output) {
  return classifyReleaseView(output) === "denied";
}

function tokenCandidates() {
  const github = (process.env.GITHUB_TOKEN || "").trim();
  const secret = (process.env.RELEASES_REPO_TOKEN || "").trim();
  const list = [];
  if (github) list.push({ token: github, via: "GITHUB_TOKEN" });
  if (secret && secret !== github) list.push({ token: secret, via: "RELEASES_REPO_TOKEN" });
  return list;
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
  const candidates = tokenCandidates();
  if (!candidates.length) {
    warn(
      "Skipping the public download upload. Neither GITHUB_TOKEN nor RELEASES_REPO_TOKEN is set. The landing page already links the public beta URLs. A token with contents write on vihaanshahh/subspaces-releases is required to publish a future tag. Nothing was billed.",
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

  let last = "";
  for (const candidate of candidates) {
    try {
      uploadRelease(candidate.token, repo, tag, title, notes, files);
      console.log(`Published ${tag} to ${repo} with ${candidate.via} (${staged.assets.length} archives + SHA256SUMS).`);
      for (const asset of manifest.assets) {
        const known = targetById(asset.id);
        console.log(`${known ? known.label : asset.id} ${asset.url}`);
      }
      return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      if (candidate.via === "GITHUB_TOKEN" && denied(last)) {
        warn(`GITHUB_TOKEN cannot write to ${repo}. ${last}`);
        continue;
      }
      throw error;
    }
  }
  warn(
    `Skipping the public download upload. GITHUB_TOKEN cannot write to ${repo}, and RELEASES_REPO_TOKEN is not set. ${last} Nothing was billed.`,
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    publish();
  } catch (error) {
    const token = process.env.RELEASES_REPO_TOKEN || process.env.GITHUB_TOKEN || "";
    const message = error instanceof Error ? error.message : String(error);
    console.error(redact(message, token));
    process.exit(1);
  }
}
