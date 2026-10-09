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

The landing page is separate from the editor. Its hero is a Canvas2D dither of the IDE, graded to Forest Ink and sage, with a shimmer, a tilt-shift band, vignette, and film grain. While `pnpm dev` is running, **Open in browser** goes to the local editor. A production build never links at `127.0.0.1`. **Download** stays on the waitlist until `VITE_DOWNLOAD_BASE_URL` points at the public GitHub Release. It never links at the private repo.

`MOCK_LLM=1` is the default when `LLM_API_KEY` is unset. The **opencode** pill is a real `opencode serve` process. Its model calls go through the proxy at `/v1`. With the canned provider, a prompt that asks to edit `src/routes/invoices.ts` reads the file and applies the change in the demo workspace. The **stub** pill is still a placeholder adapter and does not call the model or edit files.

Gravity test mode is the default (`GRAVITY_PRODUCTION` unset or `0`). Put `GRAVITY_API_KEY` and `GRAVITY_PIXEL_ID` in a gitignored `.env` (see `.env.example`). Do not commit them. Without a key, `MOCK_ADS=1` fills the slot with a local card. With a key, empty fill renders nothing. The chat panel loads the Gravity pixel from `https://code.trygravity.ai/gr-pix.js` only when `GRAVITY_PIXEL_ID` is set.

```bash
pnpm test
```

## Download a release

A `v*` tag attaches the three archives to a Release on this private repo (see `.github/workflows/release.yml`). Those files are large. They are also copied to a **separate public repository**, `vihaanshahh/subspaces-releases`, so visitors download them from GitHub. Public GitHub Release bandwidth is free and does not meter egress.

The landing buttons use stable names, so the URL does not change when the version does:

- `subspaces-si-darwin-arm64.tar.gz` — Mac Apple Silicon
- `subspaces-si-darwin-x64.tar.gz` — Mac Intel
- `subspaces-si-linux-x64.tar.gz` — Linux
- `latest.json` — version, byte size, and sha256 for each file

Example: `https://github.com/vihaanshahh/subspaces-releases/releases/latest/download/subspaces-si-darwin-arm64.tar.gz`

If the Actions secret `RELEASES_REPO_TOKEN` is missing, the workflow prints a warning and continues. It does not fail the private release, and it does not upload anywhere else.

Download the archive for your machine, unzip it, and run one command:

```bash
tar -xzf subspaces-si-0.1.0-linux-x64.tar.gz
cd subspaces-si
cp .env.example .env   # optional; leave secrets empty for the canned demo
./start
```

The public download `subspaces-si-linux-x64.tar.gz` unpacks the same `subspaces-si` folder. `pnpm package` keeps the version in the filename (`subspaces-si-0.1.0-linux-x64.tar.gz`) for the private release.

`./start` needs Node.js 22. It downloads the pinned opencode binary for that OS, then opens subspaces.si at `http://127.0.0.1:41823`. The archive contains code-server, the subspaces extension, the backend bundled as `apps/backend/server.mjs`, and `scripts/setup-opencode.mjs`. It does not contain `.env`, `node_modules`, or API keys. `./start` sets `SUBSPACES_ROOT` and the backend reads `.env` from the unpacked folder when you create one. Copy `.env.example` and fill it on the machine that runs the IDE.

To build the three archives locally:

```bash
pnpm package
```

They land in `dist/release/`. `dist/` is gitignored.

## Free public downloads

The three archives are about 680 MB together. Do not put them on Vercel Blob. Hobby Blob includes 1 GB of storage and 10 GB of transfer, then blocks access. A paid Blob plan bills storage and egress. A versioned copy plus a `latest` copy can pass the free storage allowance. This repo does not use Blob, a paid CDN, a paid GitHub plan, or any product that auto-bills.

Nothing in this setup charges a card:

- Public GitHub Releases: free bandwidth, including these archives.
- GitHub Actions on the private Free plan: 2,000 minutes a month on `ubuntu-latest`. Minutes are not billed unless a payment method is added and a spending limit is set above zero. This workflow uses `ubuntu-latest` only.
- Missing `RELEASES_REPO_TOKEN`: the public upload is skipped with a warning. No other host is called.
- Vercel Hobby hosts the marketing page and a demo video under 10 MB. The archives are not downloaded through Vercel. Setting `VITE_DOWNLOAD_BASE_URL` does not add a paid product.
- The waitlist form does not submit anywhere.

Do not enable Vercel Blob, a paid CDN, GitHub larger runners, or an Actions spending limit.

Steps, all free:

1. Create a public empty repository named `subspaces-releases` under the account `vihaanshahh`. Leave it public. Do not enable GitHub Pro, GitHub Team, or Git LFS.
2. Create a fine-grained personal access token. Resource owner `vihaanshahh`. Repository access: only `subspaces-releases`. Permissions: Contents, Read and Write. No other permissions.
3. On the private repo `vihaanshahh/subspaces`, add an Actions secret named `RELEASES_REPO_TOKEN` with that token. Settings, Secrets and variables, Actions, New repository secret.
4. Actions, Release, Run workflow. Set `tag` to `v0.1.0`. This downloads the archives already attached to the private v0.1.0 release and uploads them, plus `latest.json`, to the public repo. It does not retag and does not rebuild.
5. On the Vercel project, add a build environment variable and redeploy: `VITE_DOWNLOAD_BASE_URL=https://github.com/vihaanshahh/subspaces-releases/releases/latest/download`

After that, the landing buttons point at `https://github.com/vihaanshahh/subspaces-releases/releases/latest/download/<file>`. Until step 5, the page shows Downloads coming soon.

A later `v*` tag packages new archives, attaches them to the private release, and publishes the same stable filenames to the public repo when the secret is present. Re-running the workflow for an existing tag republishes without packaging again.

## Vercel

One Vercel project, repo root, configured in `vercel.json` as services. Do not set the project Root Directory to `apps/landing`.

| Public path | Service | What it is |
| --- | --- | --- |
| `/` and every path that is not `/api` or `/v1` | `landing` | Static Vite marketing page |
| `/api/*` and `/v1/*` | `backend` | Hono functions: health, config, ads, chat, and the OpenAI-compatible proxy |

The landing service still builds with `pnpm --filter @subspaces/landing build`. It imports `packages/brand`, so leave **Include source files outside of the Root Directory** enabled. There is no service binding: the page does not call the API, and binding URLs are not available at build time.

`packages/chat-ui` is the editor webview bundle, not a deployed site. code-server and `opencode serve` stay on the local `pnpm dev` process. On Vercel, a chat turn that asks for opencode gets the stub or Flash reply and does not edit files.

Environment variables for the landing build:

| Variable | Role |
| --- | --- |
| `VITE_DOWNLOAD_BASE_URL` | Public download folder. Buttons link to `<base>/<file>`. Leave unset and the page shows **Downloads coming soon** plus a waitlist. The waitlist never calls a server. |
| `VITE_DOWNLOAD_URL` or `NEXT_PUBLIC_DOWNLOAD_URL` | Used only when the value already ends in `/download`. A link to the private repo is ignored. |
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
| `VITE_DOWNLOAD_BASE_URL` | Landing download folder. Unset shows the waitlist. |

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
