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

The landing page is separate from the editor. Its hero is a Forest Ink field of ASCII stars drifting outward, sage to cream. **Public beta** download buttons are hardcoded. The page does not read `VITE_DOWNLOAD_BASE_URL`, `NEXT_PUBLIC_DOWNLOAD_URL`, or `VITE_IDE_URL`, and it has no waitlist. It never links at the private repo.

With `LLM_API_KEY` unset, chat and `/v1` stay on the canned provider. The **opencode** pill is a real `opencode serve` process. Its model calls go through the proxy at `/v1`. With the canned provider, a prompt that asks to edit `src/routes/invoices.ts` reads the file and applies the change in the demo workspace. The **stub** pill does not run tools. On the hosted API, where opencode is not running, a configured key streams the primary model and falls back to DeepSeek. `mockLlm` is true only when `LLM_API_KEY` is empty.

Gravity test mode is the default. Set `GRAVITY_PRODUCTION=1` to leave it. Put `GRAVITY_API_KEY` in a gitignored `.env` (see `.env.example`). Do not commit it. Without a key, the slot uses a local card. With a key, empty fill renders nothing. The chat panel always loads the public Gravity pixel `9f5969b9-4f34-449e-8360-992259cd0f50`.

```bash
pnpm test
```

## CLI

`apps/cli` is a thin wrapper around the pinned OpenCode binary (v1.18.27, MIT). It does not patch `vendor/opencode`. `subspaces` writes an OpenCode config that points the `subspaces` provider at `SUBSPACES_API` (default `https://subspaces.vercel.app/v1`) and registers GLM-5.3-Flash plus DeepSeek V4.1 Flash.

```bash
pnpm subspaces
pnpm subspaces run "add pagination to listInvoices"
pnpm subspaces balance
pnpm subspaces watch-ad
pnpm subspaces login
```

`SUBSPACES_MOCK=1`, or an API the process cannot reach, prints a canned reply so a demo still runs without the binary. `run` prints a sponsored card under the reply. The card is loaded from `/api/ads` when that route responds, and otherwise uses the local Quillfern mock (the same copy as an empty Gravity slot). `watch-ad` shows that card, counts down, and adds 15k tokens on this machine. `login` is a stub and does not store a token.

Interactive `subspaces` launches the OpenCode TUI with `OPENCODE_CONFIG` set. Download the binary first with `pnpm setup`. Mock mode stays in this process.

## Download a release

A `v*` tag attaches the three archives to a Release on this private repo (see `.github/workflows/release.yml`). Those files are large. They are also copied to a **separate public repository**, `vihaanshahh/subspaces-releases`, so visitors download them from GitHub. Public GitHub Release bandwidth is free and does not meter egress.

The landing buttons use this folder, with no build variable:

`https://github.com/vihaanshahh/subspaces-releases/releases/latest/download`

- `subspaces-si-0.1.0-darwin-arm64.tar.gz` — Mac Apple Silicon (202 MB)
- `subspaces-si-0.1.0-darwin-x64.tar.gz` — Mac Intel (221 MB)
- `subspaces-si-0.1.0-linux-x64.tar.gz` — Linux (229 MB)
- `SHA256SUMS` — `sha256sum -c` lines for those three files

`/releases/latest` skips drafts and prereleases, so the public tag `v0.1.0-beta` has to be a normal release titled `subspaces.si 0.1.0 beta`.

That public release was not created from this repo. The GitHub credentials available here can read `vihaanshahh/subspaces` and can read the empty public repo, and they cannot write `vihaanshahh/subspaces-releases`:

- `git push`: `Permission to vihaanshahh/subspaces-releases.git denied to cursor[bot].` and `The requested URL returned error: 403`
- Contents API: `{"message":"Resource not accessible by integration","status":"403"}`
- The same write returned `403 Resource not accessible by personal access token`

Until someone with contents write on that repo publishes the three archives, those download URLs 404. The landing still links them. No environment variable turns the buttons on.

A later tag push tries `GITHUB_TOKEN` first, then the optional Actions secret `RELEASES_REPO_TOKEN`. `GITHUB_TOKEN` from this private repo cannot write the other repository. If both are missing or the token is denied, the workflow prints a warning and leaves the private release in place. It does not upload anywhere else. The secret is still required for a future automatic publish. It was not a substitute for the direct `v0.1.0` upload, which did not happen.

Download the archive for your machine, unzip it, and run one command:

```bash
tar -xzf subspaces-si-0.1.0-linux-x64.tar.gz
cd subspaces-si
cp .env.example .env   # optional; leave secrets empty for the canned demo
./start
```

`pnpm package` writes the same versioned filename (`subspaces-si-0.1.0-linux-x64.tar.gz`). The public release keeps that name.

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
- Missing `RELEASES_REPO_TOKEN`, or a `GITHUB_TOKEN` that cannot write the public repo: the public upload is skipped with a warning. No other host is called.
- Vercel Hobby hosts the marketing page and a demo video under 10 MB. The archives are not downloaded through Vercel. The landing build needs no download environment variable.

Do not enable Vercel Blob, a paid CDN, GitHub larger runners, or an Actions spending limit.

Steps, all free:

The public repo `vihaanshahh/subspaces-releases` already exists and is empty. Do not enable GitHub Pro, GitHub Team, or Git LFS. Do not add a Vercel environment variable for downloads.

To publish `v0.1.0-beta` (this step is still outstanding):

1. Create a fine-grained personal access token. Resource owner `vihaanshahh`. Repository access: only `subspaces-releases`. Permissions: Contents, Read and Write. No other permissions.
2. On the private repo `vihaanshahh/subspaces`, add an Actions secret named `RELEASES_REPO_TOKEN` with that token.
3. Actions, Release, Run workflow. Set `tag` to `v0.1.0`. The script downloads the private archives and creates a **normal** public release tagged `v0.1.0-beta`, titled `subspaces.si 0.1.0 beta`, with the three archives and `SHA256SUMS`. It does not pass `--prerelease`. It does not retag the private repo and does not rebuild.

A later `v*` tag packages new archives, attaches them to the private release, and publishes that tag to the public repo when a token can write it. Re-running the workflow for an existing tag republishes without packaging again. The landing reads sizes from `api.github.com` when that latest release exists, and otherwise shows the baked-in `v0.1.0` sizes.

## Vercel

One Vercel project, repo root, configured in `vercel.json` as services. Do not set the project Root Directory to `apps/landing`.

| Public path | Service | What it is |
| --- | --- | --- |
| `/` and every path that is not `/api` or `/v1` | `landing` | Static Vite marketing page |
| `/api/*` and `/v1/*` | `backend` | Hono functions: health, config, ads, chat, and the OpenAI-compatible proxy |

The landing service still builds with `pnpm --filter @subspaces/landing build`. It imports `packages/brand`, so leave **Include source files outside of the Root Directory** enabled. There is no service binding and no required landing environment variable. Download URLs are constants in `apps/landing/src/links.ts`.

`packages/chat-ui` is the editor webview bundle, not a deployed site. code-server and `opencode serve` stay on the local `pnpm dev` process. On Vercel, opencode is off. `/api/chat` streams the primary model when `LLM_API_KEY` is set, and the canned stub reply when it is not. It does not edit files. Both functions use `maxDuration` 60.

`/v1/chat/completions` and `/api/chat` accept the desktop app (`x-subspaces-client: desktop`), the CLI (`x-subspaces-client: cli`), local opencode (`Authorization: Bearer subspaces-local`), or a token from `GET /api/session` (`x-subspaces-token` or the `subspaces_session` cookie). Browser origins are limited to subspaces.si, www.subspaces.si, subspaces.vercel.app, and localhost. Each IP is capped, and each completion is capped at 2048 output tokens and 48 KB.

## Product goals

Completely free to the user. Ad and theme revenue are meant to cover a cheap Flash model, so the proxy strips code, paths, and secrets before any ad request, counts tokens, and slows replies at a 15M-token soft cap instead of selling a subscription. The bet is steady chat paid for by ads, with a harness switch, for hobbyists and students. Frontier models and a Pro tier are out of scope.

## Environment

Copy `.env.example`. Never commit values.

| Variable | Role |
| --- | --- |
| `LLM_API_KEY` | Primary model key. Unset keeps the canned provider. |
| `LLM_FALLBACK_API_KEY` | Optional. Defaults to `LLM_API_KEY` for the DeepSeek fallback. |
| `GRAVITY_API_KEY` | Server-only Gravity key. Unset keeps the local ad card. |
| `GRAVITY_PRODUCTION` | Optional. Unset is Gravity test mode. `1` is live. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | OAuth stub. The callback does not exchange a code. |
| `SUBSPACES_LANDING_PORT` | Marketing page. Default `41825`. |

Model hosts and ids (`glm-5.3-flash`, `deepseek-v4.1-flash`) are constants in `apps/backend/src/config.ts`. `pnpm dev` reads `.env` without overriding variables already exported. A key in that file turns the live model on.

## Layout

- `apps/landing` — cream marketing page and the ASCII starfield hero
- `apps/backend` — chat adapter, OpenAI-compatible `/v1` proxy, parallel `getAds` (`below_response` and `right_response` / `sidebar`), in-memory token ledger
- `vendor/opencode` — pinned OpenCode source (submodule). The binary is downloaded beside it and gitignored
- `apps/extension` — auxiliary-bar chat and an explorer sponsored view, loaded by code-server
- `packages/chat-ui` — React panel, harness pills, Gravity card (official component when the network fills, mock card otherwise)
- `packages/brand` — cream mark, Satoshi files, theme tokens
- `apps/cli` — `subspaces` terminal wrapper around the pinned opencode binary
- `examples/tallyhouse-api` — folder the shell opens

## Screenshot

With the editor running:

```bash
pnpm screenshot
```

Writes `artifacts/subspaces-landing.png` and `artifacts/subspaces-ide.png`. The landing page and the editor both need to be running.
