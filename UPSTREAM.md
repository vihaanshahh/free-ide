# Upstream

This repository does not fork Code - OSS. The editor shell is **coder/code-server v4.141.0**, which packages Code - OSS **1.141.0** (`8b41915d25547e2edd553bab03ea4cbd621f98c5`). `scripts/setup-code-server.mjs` downloads that standalone release into `vendor/` (gitignored) and reapplies a thin brand patch.

## Brand patch (not a fork)

Reapplied every `pnpm setup` / `pnpm dev`:

- Product strings: `subspaces` / `subspaces.si` (`--app-name`, `product.json`, web manifest, document title)
- Telemetry flag off, update check off
- Extension gallery pointed at Open VSX
- Cream mark as the favicon and install icons
- Satoshi on the workbench, monospace left on the editor and terminal
- `subspaces Dark` theme contributed by `apps/extension` (Dark Modern colors, Forest Ink status bar)

Do not ship Microsoft editor trademarks or logos in product strings. "Built on Code - OSS" is the attribution to use.

## What stays ours when the shell is replaced

`apps/backend`, `packages/chat-ui`, `packages/brand`, and `apps/extension` do not import the shell. A later Code - OSS checkout (VSCodium-style patch set, small core diffs, our UI in its own extension) can replace `vendor/` without rewriting the proxy, the ledger, or the chat panel.

## Not done yet

- A pinned Code - OSS checkout and a `patches/` directory
- Weekly / tag-triggered upstream sync
- Desktop signing and auto-update
- Spawning the opencode binary. The `opencode` harness id is an adapter that sends the turn through our Flash proxy
- A second real harness (the `stub` pill is the placeholder adapter)
- GitHub OAuth token exchange and a persisted account record
- A durable token ledger. Caps are in-memory per session: 15M soft cap slows replies, 20M hard cap refuses, plus 10/minute and 60/hour
- A sold sponsored theme. The status bar shows `theme: subspaces Dark` as the empty slot
- Gravity production mode. Test mode is the default. `GRAVITY_API_KEY` and `GRAVITY_PIXEL_ID` stay in the environment
