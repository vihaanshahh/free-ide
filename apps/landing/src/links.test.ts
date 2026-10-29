import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  BETA_TAG,
  PUBLIC_DOWNLOAD_BASE,
  RELEASE_TARGETS,
  assetUrl,
  formatBytes,
  highlightTarget,
  releasesApiUrl,
} from "./links.ts";

const PRIVATE_RELEASES = "https://github.com/vihaanshahh/subspaces/releases";

test("download links are the public beta archives", () => {
  assert.equal(PUBLIC_DOWNLOAD_BASE, "https://github.com/vihaanshahh/subspaces-releases/releases/latest/download");
  assert.equal(BETA_TAG, "v0.1.0-beta");
  assert.equal(
    assetUrl("subspaces-si-0.1.0-darwin-arm64.tar.gz"),
    `${PUBLIC_DOWNLOAD_BASE}/subspaces-si-0.1.0-darwin-arm64.tar.gz`,
  );
  assert.equal(RELEASE_TARGETS.length, 3);
  assert.equal(formatBytes(211327230), "202 MB");
  assert.equal(
    releasesApiUrl(),
    "https://api.github.com/repos/vihaanshahh/subspaces-releases/releases/latest",
  );
});

test("visitor OS highlights one archive", () => {
  assert.equal(highlightTarget("macOS", "arm"), "darwin-arm64");
  assert.equal(highlightTarget("MacIntel", "Intel Mac OS X"), "darwin-x64");
  assert.equal(highlightTarget("Linux", "x86_64"), "linux-x64");
  assert.equal(highlightTarget("Windows", "x64"), null);
});

test("landing markup links the public beta and has no waitlist", () => {
  const html = fs.readFileSync(path.join(import.meta.dirname, "../index.html"), "utf8");
  assert.equal(html.includes("127.0.0.1"), false);
  assert.equal(html.includes("localhost"), false);
  assert.equal(html.includes(PRIVATE_RELEASES), false);
  assert.equal(html.includes("github.com/vihaanshahh/subspaces/releases"), false);
  assert.equal(html.includes("data-waitlist"), false);
  assert.equal(html.includes("VITE_"), false);
  assert.match(html, /class="eyebrow">Beta</);
  assert.match(html, /data-testid="demo-video"/);
  assert.match(html, /data-testid="try-chat"/);
  assert.match(html, /data-testid="token-explainer"/);
  assert.match(html, /Watch an ad to unlock more tokens/);
  assert.match(html, /How ads earn tokens/);
  assert.equal(html.includes("LLM_API_KEY"), false);
  assert.equal(html.includes("GRAVITY_API_KEY"), false);
  assert.equal(html.includes('id="field"'), false);
  assert.equal(html.includes("data-starfield"), false);
  assert.equal(html.includes("data-shark"), false);
  assert.equal(html.includes("<canvas"), false);
  assert.equal(html.includes("dither-frame"), false);
  assert.equal(html.includes("hero-source"), false);
  for (const target of RELEASE_TARGETS) {
    assert.equal(html.includes(assetUrl(target.file)), true);
  }
});
