import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  PUBLIC_DOWNLOAD_BASE,
  assetUrl,
  downloadBase,
  formatBytes,
  highlightTarget,
  ideHref,
  isLoopback,
  releasesApiUrl,
} from "./links.ts";

const PRIVATE_RELEASES = "https://github.com/vihaanshahh/subspaces/releases";

test("download base is opt-in and never falls back to the private repo", () => {
  assert.equal(downloadBase({}), null);
  assert.equal(downloadBase({ base: "http://127.0.0.1:41823/download" }), null);
  assert.equal(downloadBase({ vite: "http://localhost:41823/download" }), null);
  assert.equal(downloadBase({ vite: PRIVATE_RELEASES }), null);
  assert.equal(downloadBase({ base: PUBLIC_DOWNLOAD_BASE }), PUBLIC_DOWNLOAD_BASE);
  assert.equal(
    downloadBase({ vite: `${PUBLIC_DOWNLOAD_BASE}/` }),
    PUBLIC_DOWNLOAD_BASE,
  );
  assert.equal(
    assetUrl(PUBLIC_DOWNLOAD_BASE, "subspaces-si-darwin-arm64.tar.gz"),
    `${PUBLIC_DOWNLOAD_BASE}/subspaces-si-darwin-arm64.tar.gz`,
  );
});

test("visitor OS highlights one archive", () => {
  assert.equal(highlightTarget("macOS", "arm"), "darwin-arm64");
  assert.equal(highlightTarget("MacIntel", "Intel Mac OS X"), "darwin-x64");
  assert.equal(highlightTarget("Linux", "x86_64"), "linux-x64");
  assert.equal(highlightTarget("Windows", "x64"), null);
});

test("github latest download URLs map to the releases API", () => {
  assert.equal(
    releasesApiUrl(PUBLIC_DOWNLOAD_BASE),
    "https://api.github.com/repos/vihaanshahh/subspaces-releases/releases/latest",
  );
  assert.equal(releasesApiUrl("https://cdn.example.com/releases/latest/download"), null);
  assert.equal(formatBytes(211 * 1024 * 1024), "211 MB");
});

test("production drops a loopback editor url", () => {
  assert.equal(ideHref(undefined, false), null);
  assert.equal(ideHref("http://127.0.0.1:41823", false), null);
  assert.equal(ideHref("http://localhost:41823", false), null);
  assert.equal(ideHref("http://127.0.0.1:41823", true), "http://127.0.0.1:41823");
  assert.equal(ideHref("https://ide.subspaces.si", false), "https://ide.subspaces.si");
  assert.equal(isLoopback("http://0.0.0.0:41823"), true);
});

test("landing markup offers a waitlist instead of the private repo", () => {
  const html = fs.readFileSync(path.join(import.meta.dirname, "../index.html"), "utf8");
  assert.equal(html.includes("127.0.0.1"), false);
  assert.equal(html.includes("localhost"), false);
  assert.equal(html.includes(PRIVATE_RELEASES), false);
  assert.equal(html.includes("github.com/vihaanshahh/subspaces"), false);
  assert.match(html, /data-waitlist/);
  assert.match(html, /data-testid="waitlist"/);
  assert.match(html, /data-testid="download-darwin-arm64"/);
  assert.match(html, /data-testid="download-darwin-x64"/);
  assert.match(html, /data-testid="download-linux-x64"/);
  assert.match(html, /subspaces-si-linux-x64\.tar\.gz/);
  assert.match(html, /data-testid="demo-video"/);
  assert.match(html, /data-testid="open-ide"/);
  assert.match(html, /id="field"/);
});
