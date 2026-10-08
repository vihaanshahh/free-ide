import { setTimeout as delay } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(import.meta.dirname, "..");
const idePort = process.env.SUBSPACES_IDE_PORT || "41823";
const landingPort = process.env.SUBSPACES_LANDING_PORT || "41825";
const outDir = path.join(ROOT, "artifacts");
const landingOut = path.join(outDir, "subspaces-landing.png");
const ideOut = path.join(outDir, "subspaces-ide.png");
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1440,900"],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
page.setDefaultTimeout(120000);

await page.goto(`http://127.0.0.1:${landingPort}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("#field[data-ready='true']", { timeout: 30000 });
await page.evaluate(() => document.fonts.ready);
await delay(500);

const first = await sampleCanvas(page);
await delay(450);
const second = await sampleCanvas(page);
const moved = meanAbsDiff(first.sig, second.sig);
if (!(first.g > first.r + 2 && first.g > first.b + 2)) {
  throw new Error(`Hero is not green-dominant (rgb ${first.r.toFixed(1)}, ${first.g.toFixed(1)}, ${first.b.toFixed(1)})`);
}
if (first.spread < 18) {
  throw new Error(`Hero dither has too little contrast (spread ${first.spread.toFixed(1)})`);
}
if (moved < 0.35) {
  throw new Error(`Hero shimmer did not move (delta ${moved.toFixed(3)})`);
}

const cta = await page.$eval("[data-testid='open-ide']", (node) => node.getAttribute("href"));
if (!cta || !cta.includes(`:${idePort}`)) {
  throw new Error(`Open in browser points at ${cta}, expected port ${idePort}`);
}

await page.screenshot({ path: landingOut, fullPage: false });
console.log(landingOut);

await page.goto(`http://127.0.0.1:${idePort}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
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
await page.screenshot({ path: ideOut, fullPage: false });
await browser.close();
if (!ad) {
  throw new Error(`Ad card was not visible. Debug shot: ${ideOut}`);
}
console.log(ideOut);

async function sampleCanvas(target) {
  return target.evaluate(() => {
    const canvas = document.querySelector("#field");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("missing canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("missing context");
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    let min = 255;
    let max = 0;
    const sig = [];
    for (let y = Math.floor(height * 0.18); y < Math.floor(height * 0.72); y += 6) {
      for (let x = Math.floor(width * 0.12); x < Math.floor(width * 0.88); x += 6) {
        const i = (y * width + x) * 4;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        const luma = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
        if (luma < min) min = luma;
        if (luma > max) max = luma;
        if (sig.length < 180) sig.push(data[i], data[i + 1], data[i + 2]);
        n += 1;
      }
    }
    return { r: r / n, g: g / n, b: b / n, spread: max - min, sig };
  });
}

function meanAbsDiff(a, b) {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += Math.abs(a[i] - b[i]);
  return n === 0 ? 0 : sum / n;
}
