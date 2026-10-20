import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const clients = ["apps/landing", "apps/cli", "apps/extension", "packages/chat-ui", "packages/brand"];
const forbidden = ["LLM_API_KEY", "LLM_FALLBACK_API_KEY", "GRAVITY_API_KEY", "sk-or-"];

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "vendor") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.test\./.test(entry.name)) continue;
    if (/\.(ts|tsx|js|mjs|css|html|json|svg)$/.test(entry.name)) out.push(full);
  }
}

test("client source does not reference provider secrets", () => {
  const files: string[] = [];
  for (const rel of clients) walk(path.join(root, rel), files);
  assert.ok(files.length > 10);
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const needle of forbidden) {
      assert.equal(text.includes(needle), false, `${path.relative(root, file)} contains ${needle}`);
    }
  }
});
