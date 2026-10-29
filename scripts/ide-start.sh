#!/usr/bin/env bash
# Unzip a subspaces.si release and run this file. It reads .env from this
# directory when you create one. Nothing in the archive is a secret.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "subspaces.si needs Node.js 22 or newer on PATH." >&2
  exit 1
fi

node -e 'const major = Number(process.versions.node.split(".")[0]); if (major < 22) process.exit(1)' || {
  echo "subspaces.si needs Node.js 22 or newer. This machine has $(node -v)." >&2
  exit 1
}

if [[ ! -f apps/extension/media/chat.js ]]; then
  echo "The chat bundle is missing from apps/extension/media." >&2
  exit 1
fi

if [[ ! -f apps/backend/server.mjs ]]; then
  echo "The backend bundle is missing from apps/backend/server.mjs." >&2
  exit 1
fi

API_PORT="${SUBSPACES_API_PORT:-41824}"
IDE_PORT="${SUBSPACES_IDE_PORT:-41823}"
export SUBSPACES_API_PORT="$API_PORT"
export SUBSPACES_IDE_PORT="$IDE_PORT"
export SUBSPACES_API_ORIGIN="http://127.0.0.1:${API_PORT}"
export SUBSPACES_ROOT="$ROOT"
export OPENCODE_PORT="${OPENCODE_PORT:-41826}"
export SUBSPACES_WORKSPACE="${SUBSPACES_WORKSPACE:-$ROOT/examples/tallyhouse-api}"

node scripts/setup-opencode.mjs
export OPENCODE_BIN="$ROOT/vendor/opencode-runtime/opencode"

USER_DIR="$ROOT/.subspaces/user-data"
EXT_DIR="$ROOT/.subspaces/extensions"
mkdir -p "$USER_DIR/User" "$EXT_DIR"
ln -sfn "$ROOT/apps/extension" "$EXT_DIR/subspaces.subspaces-chat-0.1.0"

cat > "$USER_DIR/User/settings.json" << 'EOF'
{
  "workbench.colorTheme": "subspaces Dark",
  "workbench.startupEditor": "none",
  "workbench.welcomePage.walkthroughs.openOnInstall": false,
  "security.workspace.trust.enabled": false,
  "window.title": "${dirty}${activeEditorShort}${separator}${rootName}${separator}subspaces.si",
  "window.autoDetectColorScheme": false,
  "telemetry.telemetryLevel": "off",
  "update.mode": "none",
  "workbench.tips.enabled": false,
  "workbench.secondarySideBar.defaultVisibility": "visible",
  "editor.fontFamily": "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  "editor.fontSize": 13,
  "editor.lineHeight": 20,
  "terminal.integrated.fontFamily": "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  "chat.disableAIFeatures": true,
  "extensions.ignoreRecommendations": true,
  "workbench.editor.enablePreview": false
}
EOF

CONFIG="$ROOT/.subspaces/config.yaml"
cat > "$CONFIG" << EOF
bind-addr: 127.0.0.1:${IDE_PORT}
auth: none
disable-telemetry: true
disable-update-check: true
disable-workspace-trust: true
disable-getting-started-override: true
app-name: subspaces.si
EOF

CODE_SERVER="$ROOT/vendor/code-server/bin/code-server"
if [[ ! -x "$CODE_SERVER" ]]; then
  echo "code-server is missing at vendor/code-server/bin/code-server." >&2
  exit 1
fi

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

(
  cd "$ROOT/apps/backend"
  exec node ./server.mjs
) &
API_PID=$!

echo ""
echo "subspaces.si  http://127.0.0.1:${IDE_PORT}"
echo "proxy         http://127.0.0.1:${API_PORT}"
echo ""

"$CODE_SERVER" \
  --config "$CONFIG" \
  --auth none \
  --bind-addr "127.0.0.1:${IDE_PORT}" \
  --disable-telemetry \
  --disable-update-check \
  --disable-workspace-trust \
  --disable-getting-started-override \
  --ignore-last-opened \
  --app-name subspaces.si \
  --user-data-dir "$USER_DIR" \
  --extensions-dir "$EXT_DIR" \
  --vscode-option disable-extension=GitHub.copilot-chat \
  "$SUBSPACES_WORKSPACE"
