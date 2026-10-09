import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildManifest, parseVersionedArchive, selectArchives } from "./release-assets.mjs";
import { sha256File, stagePublicAssets } from "./publish-public-release.mjs";

test("versioned archive names map to stable download files", () => {
  assert.deepEqual(parseVersionedArchive("subspaces-si-0.1.0-darwin-arm64.tar.gz"), {
    version: "0.1.0",
    target: "darwin-arm64",
    file: "subspaces-si-0.1.0-darwin-arm64.tar.gz",
  });
  assert.equal(parseVersionedArchive("subspaces-si-darwin-arm64.tar.gz"), null);
  assert.equal(parseVersionedArchive("latest.json"), null);

  const selected = selectArchives([
    "subspaces-si-0.1.0-linux-x64.tar.gz",
    "subspaces-si-0.1.0-darwin-x64.tar.gz",
    "subspaces-si-0.1.0-darwin-arm64.tar.gz",
    "notes.txt",
  ]);
  assert.deepEqual(selected.missing, []);
  assert.equal(selected.version, "0.1.0");
  assert.equal(selected.chosen.get("darwin-arm64").file, "subspaces-si-0.1.0-darwin-arm64.tar.gz");
});

test("manifest points at the public latest download path", () => {
  const manifest = buildManifest({
    version: "0.1.0",
    tag: "v0.1.0",
    baseUrl: "https://github.com/vihaanshahh/subspaces-releases/releases/latest/download/",
    assets: [
      {
        id: "linux-x64",
        label: "Linux",
        file: "subspaces-si-linux-x64.tar.gz",
        size: 12,
        sha256: "abc",
      },
    ],
  });
  assert.equal(manifest.tag, "v0.1.0");
  assert.equal(
    manifest.assets[0].url,
    "https://github.com/vihaanshahh/subspaces-releases/releases/latest/download/subspaces-si-linux-x64.tar.gz",
  );
  assert.equal(manifest.baseUrl.endsWith("/"), false);
});

test("staging renames archives and records sha256", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "subspaces-release-"));
  const releaseDir = path.join(root, "release");
  const stageDir = path.join(root, "stage");
  fs.mkdirSync(releaseDir);
  for (const name of [
    "subspaces-si-0.1.0-darwin-arm64.tar.gz",
    "subspaces-si-0.1.0-darwin-x64.tar.gz",
    "subspaces-si-0.1.0-linux-x64.tar.gz",
  ]) {
    fs.writeFileSync(path.join(releaseDir, name), `bytes-${name}`);
  }
  const staged = stagePublicAssets(releaseDir, stageDir);
  assert.equal(staged.version, "0.1.0");
  assert.equal(staged.assets.length, 3);
  const linux = staged.assets.find((asset) => asset.id === "linux-x64");
  assert.equal(linux.file, "subspaces-si-linux-x64.tar.gz");
  assert.equal(linux.sha256, sha256File(path.join(stageDir, linux.file)));
  assert.equal(fs.existsSync(path.join(stageDir, "subspaces-si-darwin-arm64.tar.gz")), true);
});

test("missing token warns and does not fail", () => {
  const env = { ...process.env };
  delete env.RELEASES_REPO_TOKEN;
  const result = spawnSync(process.execPath, ["scripts/publish-public-release.mjs"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /::warning::/);
  assert.match(result.stdout, /RELEASES_REPO_TOKEN/);
  assert.equal(result.stdout.includes("BLOB"), false);
});
