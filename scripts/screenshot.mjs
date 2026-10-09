import { setTimeout as delay } from "node:timers/promises";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(import.meta.dirname, "..");
const idePort = process.env.SUBSPACES_IDE_PORT || "41823";
const landingPort = process.env.SUBSPACES_LANDING_PORT || "41825";
const outDir = path.join(ROOT, "artifacts");
const landingOut = path.join(outDir, "subspaces-landing.png");
const ideOut = path.join(outDir, "subspaces-ide.png");
const opencodeOut = path.join(outDir, "subspaces-opencode-gravity.png");
fs.mkdirSync(outDir, { recursive: true });

const onlyOpencode = process.env.SCREENSHOT_ONLY === "opencode";

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1440,900"],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
page.setDefaultTimeout(120000);

if (!onlyOpencode) {
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

const download = await page.$eval("[data-testid='download-linux-x64']", (node) => node.getAttribute("href"));
if (!download || !download.includes("subspaces-releases")) {
  throw new Error(`Download points at ${download}`);
}

await page.screenshot({ path: landingOut, fullPage: false });
console.log(landingOut);
}

await page.goto(`http://127.0.0.1:${idePort}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector(".monaco-workbench", { timeout: 120000 });
for (let attempt = 0; attempt < 6; attempt += 1) await page.keyboard.press("Escape");

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

await openChatPane(page);

let found = false;
for (let attempt = 0; attempt < 40 && !found; attempt += 1) {
  for (const frame of page.frames()) {
    const prompt = await frame.$("[data-testid='sample-prompt']").catch(() => null);
    if (!prompt) continue;
    const box = await prompt.boundingBox();
    if (!box || box.height < 8 || box.width < 8) continue;
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

let ready = false;
for (let attempt = 0; attempt < 90 && !ready; attempt += 1) {
  for (const frame of page.frames()) {
    const state = await frame
      .evaluate(() => {
        const ad = document.querySelector("[data-testid='gravity-ad']");
        const reply = document.querySelector("[data-testid='assistant-reply']");
        const live = document.querySelector("[data-testid='harness-live']");
        const text = reply?.textContent || "";
        const rect = ad?.getBoundingClientRect();
        if (ad) ad.scrollIntoView({ block: "center" });
        return {
          ad: ad?.getAttribute("data-ad-source") || "",
          live: Boolean(live),
          edited: /nextCursor/.test(text),
          adH: rect ? Math.round(rect.height) : 0,
          adW: rect ? Math.round(rect.width) : 0,
        };
      })
      .catch(() => null);
    if (state?.live && state.edited && state.ad === "gravity" && state.adH > 40 && state.adW > 80) {
      ready = true;
      console.log(`ad box ${state.adW}x${state.adH}`);
      break;
    }
  }
  if (!ready) await delay(1000);
}

await delay(400);
await page.mouse.click(760, 420);
for (let attempt = 0; attempt < 4; attempt += 1) await page.keyboard.press("Escape");
await delay(300);
if (!onlyOpencode) {
  await page.screenshot({ path: ideOut, fullPage: false });
  console.log(ideOut);
}
await page.screenshot({ path: opencodeOut, fullPage: false });
await browser.close();
if (!ready) {
  throw new Error(`Opencode reply with a Gravity ad was not visible. Debug shot: ${opencodeOut}`);
}
assertLightCard(opencodeOut);
console.log(opencodeOut);

async function openChatPane(page) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const state = await page.evaluate(() => {
      const headers = [...document.querySelectorAll(".pane-header")];
      const header = (pattern) => headers.find((node) => pattern.test(node.innerText || ""));
      const explorer = header(/tallyhouse-api/);
      const chat = header(/^Chat\b/);
      const sponsored = header(/Sponsored/);
      if (explorer?.getAttribute("aria-expanded") === "true") explorer.click();
      if (chat?.getAttribute("aria-expanded") === "false") chat.click();
      const chatBox = chat?.getBoundingClientRect();
      const sponsoredBox = sponsored?.getBoundingClientRect();
      const height = chatBox && sponsoredBox ? sponsoredBox.y - (chatBox.y + chatBox.height) : chatBox?.height || 0;
      return { height: Math.round(height), chat: Boolean(chat) };
    });
    if (state.chat && state.height > 420) return;
    await delay(400);
  }
  throw new Error("Chat pane did not expand enough to show a reply and an ad");
}

function assertLightCard(file) {
  const decoded = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
    { maxBuffer: 20_000_000 },
  );
  if (decoded.status !== 0) throw new Error("Could not decode the IDE screenshot");
  const data = decoded.stdout;
  const width = 1440;
  const height = 900;
  if (data.length !== width * height * 3) {
    throw new Error(`Unexpected screenshot size ${data.length}`);
  }
  let light = 0;
  for (let i = 0; i < data.length; i += 3) {
    if (data[i] > 210 && data[i + 1] > 210 && data[i + 2] > 210) light += 1;
  }
  if (light < 4000) {
    throw new Error(`Gravity card is not visible (${light} light pixels)`);
  }
}

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
