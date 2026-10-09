# subspaces.si

Free, ad-funded AI coding chat inside a real editor shell. No Pro tier. Flash-class models only. Ads sit under replies and, when filled, in the explorer.

The editor is [code-server](https://github.com/coder/code-server) v4.141.0 (Code - OSS 1.141.0), branded subspaces. See [UPSTREAM.md](UPSTREAM.md) for the pin and for what a later Code - OSS fork would replace.

## Run

```bash
pnpm i
pnpm dev
```

The first `pnpm dev` downloads the code-server tarball and the pinned OpenCode binary into `vendor/` if they are not there yet (not committed). Then it starts:

- the marketing page at [http://127.0.0.1:41825](http://127.0.0.1:41825)
- the editor at [http://127.0.0.1:41823](http://127.0.0.1:41823) (auth disabled for local demo)
- the proxy at [http://127.0.0.1:41824](http://127.0.0.1:41824)

The landing page is separate from the editor. Its hero is a Canvas2D dither of the IDE, graded to Forest Ink and sage, with a shimmer, a tilt-shift band, vignette, and film grain. While `pnpm dev` is running, **Open in browser** goes to the local editor. A production build never links at `127.0.0.1`. **Download** goes to the GitHub Releases page.

`MOCK_LLM=1` is the default when `LLM_API_KEY` is unset. The **opencode** pill is a real `opencode serve` process. Its model calls go through the proxy at `/v1`. With the canned provider, a prompt that asks to edit `src/routes/invoices.ts` reads the file and applies the change in the demo workspace. The **stub** pill is still a placeholder adapter and does not call the model or edit files.

Gravity test mode is the default (`GRAVITY_PRODUCTION` unset or `0`). Put `GRAVITY_API_KEY` and `GRAVITY_PIXEL_ID` in a gitignored `.env` (see `.env.example`). Do not commit them. Without a key, `MOCK_ADS=1` fills the slot with a local card. With a key, empty fill renders nothing. The chat panel loads the Gravity pixel from `https://code.trygravity.ai/gr-pix.js` only when `GRAVITY_PIXEL_ID` is set.

```bash
pnpm test
```

## Download a release

Published archives are attached to a GitHub Release when a `v*` tag is pushed (see `.github/workflows/release.yml`). That workflow is not exercised until this repo is on GitHub.

Download the archive for your machine (`darwin-arm64`, `darwin-x64`, or `linux-x64`), unzip it, and run one command:

```bash
tar -xzf subspaces-si-0.1.0-linux-x64.tar.gz
cd subspaces-si
cp .env.example .env   # optional; leave secrets empty for the canned demo
./start
```

`./start` needs Node.js 22. It downloads the pinned opencode binary for that OS, then opens subspaces.si at `http://127.0.0.1:41823`. The archive contains code-server, the subspaces extension, the backend bundled as `apps/backend/server.mjs`, and `scripts/setup-opencode.mjs`. It does not contain `.env`, `node_modules`, or API keys. `./start` sets `SUBSPACES_ROOT` and the backend reads `.env` from the unpacked folder when you create one. Copy `.env.example` and fill it on the machine that runs the IDE.

To build the three archives locally:

```bash
pnpm package
```

They land in `dist/release/`. `dist/` is gitignored.

## Landing on Vercel

The marketing page builds on its own. It does not need the backend or code-server.

1. Import this repo in Vercel.
2. Set **Root Directory** to `apps/landing`.
3. Leave **Include source files outside of the Root Directory** enabled (the default for projects created after August 2020). The page imports `packages/brand`, and pnpm install uses the lockfile at the repo root.
4. Framework preset Vite. `apps/landing/vercel.json` sets the install command, `pnpm build`, and output directory `dist`.
5. Environment variables, set before the build:

| Variable | Role |
| --- | --- |
| `VITE_DOWNLOAD_URL` or `NEXT_PUBLIC_DOWNLOAD_URL` | Releases page for the Download button. Fallback is `https://github.com/vihaanshahh/subspaces/releases/latest`. |
| `VITE_IDE_URL` | Public **Open in browser** URL. Leave unset until an editor is hosted. A loopback value is dropped from the production build. |

`pnpm dev` still sets `VITE_IDE_URL` to the local editor so the demo CTA works on your machine.

## Product goals

Completely free to the user. Ad and theme revenue are meant to cover a cheap Flash model, so the proxy strips code, paths, and secrets before any ad request, counts tokens, and slows replies at a 15M-token soft cap instead of selling a subscription. The bet is steady chat paid for by ads, with a harness switch, for hobbyists and students. Frontier models and a Pro tier are out of scope.

## Environment

Copy `.env.example`. Never commit values.

| Variable | Role |
| --- | --- |
| `MOCK_LLM` | `1` serves the canned OpenAI-compatible provider (tool calls included). Default on when `LLM_API_KEY` is empty. |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Primary Flash endpoint. Default model id `glm-5.3-flash`. |
| `LLM_FALLBACK_BASE_URL`, `LLM_FALLBACK_API_KEY`, `LLM_FALLBACK_MODEL` | Used when the primary request fails. Default fallback id `deepseek-v4.1-flash`. |
| `GRAVITY_API_KEY` | Server-only Gravity key. Leave empty in git. |
| `GRAVITY_PIXEL_ID` | Browser pixel id. Leave empty in git. |
| `GRAVITY_PRODUCTION` | `0` (default) is Gravity test mode. `1` is live. |
| `MOCK_ADS` | `1` fills an empty slot with the demo card. Leave unset or `0` when a Gravity key is set. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | OAuth stub. The callback does not exchange a code. |
| `SUBSPACES_LANDING_PORT` | Marketing page. Default `41825`. |
| `VITE_IDE_URL` | Landing **Open in browser** target. `pnpm dev` points it at the local editor. Production builds ignore loopback. |
| `VITE_DOWNLOAD_URL`, `NEXT_PUBLIC_DOWNLOAD_URL` | Landing **Download** target. Either one wins over the GitHub Releases fallback. |

`pnpm dev` reads `.env` without overriding variables already exported. It turns mock LLM on when `LLM_API_KEY` is empty, and turns mock ads on only when no Gravity key is set.

## Layout

- `apps/landing` — cream marketing page and the green dither hero
- `apps/backend` — chat adapter, OpenAI-compatible `/v1` proxy, parallel `getAds` (`below_response` and `right_response` / `sidebar`), in-memory token ledger
- `vendor/opencode` — pinned OpenCode source (submodule). The binary is downloaded beside it and gitignored
- `apps/extension` — auxiliary-bar chat and an explorer sponsored view, loaded by code-server
- `packages/chat-ui` — React panel, harness pills, Gravity card (official component when the network fills, mock card otherwise)
- `packages/brand` — cream mark, Satoshi files, theme tokens
- `examples/tallyhouse-api` — folder the shell opens

## Screenshot

With the editor running:

```bash
pnpm screenshot
```

Writes `artifacts/subspaces-landing.png` and `artifacts/subspaces-ide.png`. The landing page and the editor both need to be running.
