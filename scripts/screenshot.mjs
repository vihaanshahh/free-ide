import { setTimeout as delay } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(import.meta.dirname, "..");
const port = process.env.SUBSPACES_IDE_PORT || "41823";
const url = `http://127.0.0.1:${port}/`;
const outDir = path.join(ROOT, "artifacts");
const out = path.join(outDir, "subspaces-ide.png");
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1440,900"],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
page.setDefaultTimeout(120000);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector(".monaco-workbench", { timeout: 120000 });

for (let attempt = 0; attempt < 8; attempt += 1) {
  const clicked = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll("a.monaco-button, button.monaco-button, .monaco-button")];
    const target = nodes.find((node) => /yes, i trust|trust|ok/i.test(node.textContent || ""));
    if (!target) return false;
    target.click();
    return true;
  });
  if (!clicked) break;
  await delay(500);
}

let found = false;
for (let attempt = 0; attempt < 40 && !found; attempt += 1) {
  for (const frame of page.frames()) {
    const prompt = await frame.$("[data-testid='sample-prompt']").catch(() => null);
    if (!prompt) continue;
    await prompt.click();
    found = true;
    break;
  }
  if (!found) await delay(1000);
}

if (!found) {
  await page.screenshot({ path: path.join(outDir, "subspaces-ide-debug.png") });
  await browser.close();
  throw new Error("Chat panel did not show the sample prompt");
}

let ad = false;
for (let attempt = 0; attempt < 40 && !ad; attempt += 1) {
  for (const frame of page.frames()) {
    const card = await frame.$("[data-testid='gravity-ad']").catch(() => null);
    if (card) {
      ad = true;
      break;
    }
  }
  if (!ad) await delay(400);
}

await delay(600);
await page.screenshot({ path: out, fullPage: false });
await browser.close();
if (!ad) {
  throw new Error(`Ad card was not visible. Debug shot: ${out}`);
}
console.log(out);
