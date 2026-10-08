const vscode = require("vscode");
const crypto = require("crypto");

const API_ORIGIN =
  process.env.SUBSPACES_API_ORIGIN ||
  `http://127.0.0.1:${process.env.SUBSPACES_API_PORT || "41824"}`;

function activate(context) {
  const chat = new PanelProvider(context, "chat");
  const sidebar = new PanelProvider(context, "sidebar");
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("subspaces.chatView", chat, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider("subspaces.sidebarAd", sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  const brand = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  brand.text = "subspaces.si";
  brand.tooltip = "subspaces.si — free, ad-funded";
  brand.show();

  const theme = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  theme.text = "theme: subspaces Dark";
  theme.tooltip = "Sponsored theme slot. No sponsor is set.";
  theme.show();
  context.subscriptions.push(brand, theme);

  setTimeout(() => {
    openShell().catch((error) => console.error("subspaces shell open failed", error));
  }, 600);
}

async function openShell() {
  const commands = [
    "workbench.action.focusAuxiliaryBar",
    "subspaces.chatView.focus",
  ];
  for (const command of commands) {
    try {
      await vscode.commands.executeCommand(command);
    } catch {
      // The auxiliary bar command name moves between editor versions.
    }
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;
  const file = vscode.Uri.joinPath(folder.uri, "src", "routes", "invoices.ts");
  try {
    const document = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(document, { preview: false });
  } catch {
    // Sample file is only present in the demo workspace.
  }
}

class PanelProvider {
  constructor(context, surface) {
    this.context = context;
    this.surface = surface;
  }

  resolveWebviewView(webviewView) {
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    webview.onDidReceiveMessage((message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "hello" && this.surface === "chat") {
        sendConfig(webview).catch((error) => console.error(error));
      }
      if (message.type === "sidebar") {
        sendSidebar(webview).catch((error) => console.error(error));
      }
      if (message.type === "chat") {
        streamChat(webview, message.payload).catch((error) => {
          webview.postMessage({
            type: "event",
            event: { type: "error", message: error instanceof Error ? error.message : "Proxy error" },
          });
        });
      }
    });
    webview.html = htmlFor(webview, this.context, this.surface);
    const push = this.surface === "sidebar" ? sendSidebar(webview) : sendConfig(webview);
    push.catch((error) => console.error(error));
  }
}

function htmlFor(webview, context, surface) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const script = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", "chat.js"));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", "chat.css"));
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data: blob: https:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} data:`,
    `script-src 'nonce-${nonce}'`,
    "connect-src http: https:",
  ].join("; ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="${style}" />
  <title>subspaces</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__SUBSPACES__ = ${JSON.stringify({ surface })};
    try { window.__SUBSPACES_VSCODE__ = acquireVsCodeApi(); } catch (error) {}
  </script>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}

async function sendConfig(webview) {
  const response = await fetch(`${API_ORIGIN}/api/config`);
  const config = await response.json();
  webview.postMessage({ type: "config", config });
}

async function sendSidebar(webview) {
  const response = await fetch(`${API_ORIGIN}/api/ads/sidebar`);
  const body = await response.json();
  webview.postMessage({ type: "sidebar-ad", ad: body.ad ?? null });
}

async function streamChat(webview, payload) {
  const response = await fetch(`${API_ORIGIN}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    webview.postMessage({
      type: "event",
      event: { type: "error", message: body.error || "The subspaces proxy rejected the turn." },
    });
    webview.postMessage({ type: "event", event: { type: "done", ad: null } });
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((item) => item.startsWith("data:"));
      if (!line) continue;
      const event = JSON.parse(line.slice(5).trim());
      webview.postMessage({ type: "event", event });
    }
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
