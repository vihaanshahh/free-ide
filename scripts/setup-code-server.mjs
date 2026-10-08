import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
export const CODE_SERVER_VERSION = "4.141.0";
const VENDOR = path.join(ROOT, "vendor", "code-server", `code-server-${CODE_SERVER_VERSION}-linux-amd64`);
const TARBALL = path.join(ROOT, "vendor", `code-server-${CODE_SERVER_VERSION}-linux-amd64.tar.gz`);
const RELEASE = `https://github.com/coder/code-server/releases/download/v${CODE_SERVER_VERSION}/code-server-${CODE_SERVER_VERSION}-linux-amd64.tar.gz`;

export function codeServerBin() {
  return path.join(VENDOR, "bin", "code-server");
}

export function setup() {
  fs.mkdirSync(path.join(ROOT, "vendor"), { recursive: true });
  if (!fs.existsSync(codeServerBin())) {
    if (!fs.existsSync(TARBALL)) {
      execFileSync("curl", ["-fL", "--retry", "3", "-o", TARBALL, RELEASE], { stdio: "inherit" });
    }
    fs.mkdirSync(path.join(ROOT, "vendor", "code-server"), { recursive: true });
    execFileSync("tar", ["-C", path.join(ROOT, "vendor", "code-server"), "-xzf", TARBALL], {
      stdio: "inherit",
    });
  }
  brand(VENDOR);
  writeTheme(VENDOR);
  const media = path.join(ROOT, "apps", "extension", "media");
  fs.mkdirSync(media, { recursive: true });
  fs.copyFileSync(path.join(ROOT, "packages", "brand", "logo", "mark.svg"), path.join(media, "mark.svg"));
  console.log(`subspaces shell ready: code-server ${CODE_SERVER_VERSION}`);
}

function brand(root) {
  const productPath = path.join(root, "lib", "vscode", "product.json");
  const product = JSON.parse(fs.readFileSync(productPath, "utf8"));
  Object.assign(product, {
    nameShort: "subspaces",
    nameLong: "subspaces.si",
    applicationName: "subspaces",
    dataFolderName: ".subspaces",
    win32MutexName: "subspaces",
    win32DirName: "subspaces",
    win32NameVersion: "subspaces",
    win32RegValueName: "subspaces",
    win32AppUserModelId: "si.subspaces.app",
    win32ShellNameShort: "subspaces",
    serverApplicationName: "subspaces",
    serverDataFolderName: ".subspaces-server",
    urlProtocol: "subspaces",
    darwinBundleIdentifier: "si.subspaces.app",
    linuxIconName: "subspaces",
    reportIssueUrl: "https://subspaces.si",
    documentationUrl: "https://subspaces.si",
    enableTelemetry: false,
    extensionsGallery: {
      serviceUrl: "https://open-vsx.org/vscode/gallery",
      itemUrl: "https://open-vsx.org/vscode/item",
      resourceUrlTemplate: "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}",
      controlUrl: "",
      recommendationsUrl: "",
    },
  });
  if (Array.isArray(product.onboardingKeymaps)) {
    for (const keymap of product.onboardingKeymaps) {
      if (keymap.id === "vscode") {
        keymap.label = "Default";
        keymap.description = "Default keyboard mapping";
      }
    }
  }
  fs.writeFileSync(productPath, `${JSON.stringify(product, null, 2)}\n`);

  const htmlPath = path.join(root, "lib", "vscode", "out", "vs", "code", "browser", "workbench", "workbench.html");
  let html = fs.readFileSync(htmlPath, "utf8");
  html = html.replace('content="Code"', 'content="subspaces"');
  if (!html.includes("<title>subspaces.si</title>")) {
    html = html.replace("<head>", "<head>\n\t\t<title>subspaces.si</title>");
  }
  fs.writeFileSync(htmlPath, html);

  const manifestPath = path.join(root, "lib", "vscode", "resources", "server", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.name = "subspaces.si";
  manifest.short_name = "subspaces";
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const mark = path.join(ROOT, "packages", "brand", "logo", "mark.svg");
  const browserMedia = path.join(root, "src", "browser", "media");
  fs.copyFileSync(mark, path.join(browserMedia, "favicon.svg"));
  fs.copyFileSync(mark, path.join(browserMedia, "favicon-dark-support.svg"));
  renderIcons(mark, root);
  injectFont(root);
}

function injectFont(root) {
  const cssPath = path.join(root, "lib", "vscode", "out", "vs", "code", "browser", "workbench", "workbench.css");
  const cssDir = path.dirname(cssPath);
  for (const weight of ["400", "500", "700"]) {
    fs.copyFileSync(
      path.join(ROOT, "packages", "brand", "fonts", `satoshi-${weight}.woff2`),
      path.join(cssDir, `subspaces-satoshi-${weight}.woff2`),
    );
  }
  const start = "/* subspaces-brand-start */";
  const end = "/* subspaces-brand-end */";
  const block = `${start}
@font-face{font-family:"Satoshi";src:url("./subspaces-satoshi-400.woff2") format("woff2");font-weight:400;font-display:swap;}
@font-face{font-family:"Satoshi";src:url("./subspaces-satoshi-500.woff2") format("woff2");font-weight:500;font-display:swap;}
@font-face{font-family:"Satoshi";src:url("./subspaces-satoshi-700.woff2") format("woff2");font-weight:700;font-display:swap;}
.monaco-workbench{font-family:"Satoshi","Inter",system-ui,sans-serif;}
${end}
`;
  let css = fs.readFileSync(cssPath, "utf8");
  const startAt = css.indexOf(start);
  if (startAt >= 0) css = css.slice(0, startAt);
  fs.writeFileSync(cssPath, `${css.trimEnd()}\n${block}`);
}

function writeTheme(root) {
  const dir = path.join(root, "lib", "vscode", "extensions", "theme-defaults", "themes");
  const colors = {};
  const tokenColors = [];
  const semantic = {};
  const seen = new Set();

  function absorb(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    if (data.include) absorb(String(data.include).replace("./", ""));
    Object.assign(colors, data.colors || {});
    Object.assign(semantic, data.semanticTokenColors || {});
    if (Array.isArray(data.tokenColors)) tokenColors.push(...data.tokenColors);
  }

  absorb("dark_modern.json");
  Object.assign(colors, {
    "statusBar.background": "#0f3e17",
    "statusBar.foreground": "#fffefc",
    "statusBar.border": "#0f3e17",
    "statusBar.noFolderBackground": "#0f3e17",
    "statusBar.debuggingBackground": "#0c2f10",
    "statusBarItem.remoteBackground": "#0c2f10",
    "statusBarItem.remoteForeground": "#fffefc",
    "activityBarBadge.background": "#0f3e17",
    "activityBarBadge.foreground": "#fffefc",
    "activityBar.activeBorder": "#b1dbb8",
    "button.background": "#0f3e17",
    "button.foreground": "#fffefc",
    "button.hoverBackground": "#0c2f10",
    "focusBorder": "#0f3e17",
    "list.activeSelectionBackground": "#0f3e1733",
    "tab.activeBorderTop": "#0f3e17",
    "progressBar.background": "#b1dbb8",
    "badge.background": "#0f3e17",
    "badge.foreground": "#fffefc",
    "textLink.foreground": "#b1dbb8",
  });

  const theme = {
    $schema: "vscode://schemas/color-theme",
    name: "subspaces Dark",
    type: "dark",
    colors,
    tokenColors,
    semanticTokenColors: semantic,
  };
  const out = path.join(ROOT, "apps", "extension", "themes");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "subspaces-dark.json"), `${JSON.stringify(theme, null, 2)}\n`);
}

function renderIcons(mark, root) {
  for (const size of [192, 512]) {
    const htmlPath = path.join("/tmp", `subspaces-icon-${size}.html`);
    const png = path.join("/tmp", `subspaces-icon-${size}.png`);
    fs.writeFileSync(
      htmlPath,
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fffefc;overflow:hidden}</style><img src="file://${mark}" width="${size}" height="${size}">`,
    );
    try {
      execFileSync(
        "/opt/google/chrome/chrome",
        [
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--hide-scrollbars",
          "--user-data-dir=/tmp/subspaces-chrome-icons",
          "--virtual-time-budget=2000",
          `--screenshot=${png}`,
          `--window-size=${size},${size}`,
          `file://${htmlPath}`,
        ],
        { stdio: "pipe", timeout: 20000 },
      );
      const media = path.join(root, "src", "browser", "media");
      fs.copyFileSync(png, path.join(media, `pwa-icon-${size}.png`));
      fs.copyFileSync(png, path.join(media, `pwa-icon-maskable-${size}.png`));
      const serverIcon = path.join(root, "lib", "vscode", "resources", "server", `code-${size}.png`);
      if (fs.existsSync(path.dirname(serverIcon))) fs.copyFileSync(png, serverIcon);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Icon render skipped for ${size}: ${message}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  setup();
}
