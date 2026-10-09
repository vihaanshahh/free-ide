import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DEFAULT_DOWNLOAD_URL, downloadHref, ideHref, isLoopback } from "./links.ts";

test("download prefers a public env url and ignores loopback", () => {
  assert.equal(downloadHref({}), DEFAULT_DOWNLOAD_URL);
  assert.equal(downloadHref({ vite: "http://127.0.0.1:41823" }), DEFAULT_DOWNLOAD_URL);
  assert.equal(downloadHref({ next: "http://localhost:41823/ide" }), DEFAULT_DOWNLOAD_URL);
  assert.equal(
    downloadHref({ vite: "https://github.com/acme/subspaces/releases/latest" }),
    "https://github.com/acme/subspaces/releases/latest",
  );
  assert.equal(
    downloadHref({ next: "https://github.com/acme/subspaces/releases" }),
    "https://github.com/acme/subspaces/releases",
  );
});

test("production drops a loopback editor url", () => {
  assert.equal(ideHref(undefined, false), null);
  assert.equal(ideHref("http://127.0.0.1:41823", false), null);
  assert.equal(ideHref("http://localhost:41823", false), null);
  assert.equal(ideHref("http://127.0.0.1:41823", true), "http://127.0.0.1:41823");
  assert.equal(ideHref("https://ide.subspaces.si", false), "https://ide.subspaces.si");
  assert.equal(isLoopback("http://0.0.0.0:41823"), true);
});

test("landing markup does not point at loopback", () => {
  const html = fs.readFileSync(path.join(import.meta.dirname, "../index.html"), "utf8");
  assert.equal(html.includes("127.0.0.1"), false);
  assert.equal(html.includes("localhost"), false);
  assert.equal(html.includes(DEFAULT_DOWNLOAD_URL), true);
  assert.match(html, /data-download/);
  assert.match(html, /data-testid="open-ide"/);
});
