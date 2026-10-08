# subspaces.si

Free, ad-funded AI coding chat inside a real editor shell. No Pro tier. Flash-class models only. Ads sit under replies and, when filled, in the explorer.

The editor is [code-server](https://github.com/coder/code-server) v4.141.0 (Code - OSS 1.141.0), branded subspaces. See [UPSTREAM.md](UPSTREAM.md) for the pin and for what a later Code - OSS fork would replace.

## Run

```bash
pnpm i
pnpm dev
```

The first `pnpm dev` downloads the code-server tarball into `vendor/` if it is not there yet (about 230 MB, not committed). Then it starts:

- the marketing page at [http://127.0.0.1:41825](http://127.0.0.1:41825)
- the editor at [http://127.0.0.1:41823](http://127.0.0.1:41823) (auth disabled for local demo)
- the proxy at [http://127.0.0.1:41824](http://127.0.0.1:41824)

The landing page is separate from the editor. Its hero is a Canvas2D dither of the IDE, graded to Forest Ink and sage, with a shimmer, a tilt-shift band, vignette, and film grain. **Open in browser** goes to the editor.

`MOCK_LLM=1` is the default when `LLM_API_KEY` is unset, so a chat round-trip works with no provider key. Open the sample `tallyhouse-api` folder, use the **opencode** pill, and send a prompt. A white sponsored card renders under the reply. The **stub** pill is the second harness adapter and does not call the model.

```bash
pnpm test
```

## Product goals

Completely free to the user. Ad and theme revenue are meant to cover a cheap Flash model, so the proxy strips code, paths, and secrets before any ad request, counts tokens, and slows replies at a 15M-token soft cap instead of selling a subscription. The bet is steady chat paid for by ads, with a harness switch, for hobbyists and students. Frontier models and a Pro tier are out of scope.

## Environment

Copy `.env.example`. Never commit values.

| Variable | Role |
| --- | --- |
| `MOCK_LLM` | `1` streams a canned coding reply. Default on when `LLM_API_KEY` is empty. |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | OpenAI-compatible Flash endpoint. Default model name `glm-5.3-flash`. |
| `GRAVITY_API_KEY` | Server-only Gravity key. Omit it and the demo uses a mock creative. |
| `GRAVITY_PIXEL_ID` | Browser pixel id from the Gravity dashboard. Not hardcoded. |
| `GRAVITY_PRODUCTION` | `0` (default) is Gravity test mode. `1` is live. |
| `MOCK_ADS` | `1` fills an empty slot with the demo card. Default on when no Gravity key is set. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | OAuth stub. The callback does not exchange a code. |
| `SUBSPACES_LANDING_PORT` | Marketing page. Default `41825`. |
| `VITE_IDE_URL` | Where the landing CTA opens the editor. Default `http://127.0.0.1:41823`. |

`pnpm dev` forces mock LLM and mock ads unless you export the variables first.

## Layout

- `apps/landing` — cream marketing page and the green dither hero
- `apps/backend` — chat proxy, parallel `getAds` (`below_response` and a sidebar placement), in-memory token ledger
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
