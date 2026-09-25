# Releasing

Details: [README.md#releases](README.md#releases). Every script: [README.md#scripts](README.md#scripts).

JS-only change: OTA update. Native change (native dep, app.json, config plugin, an env var baked into the build): new APK. `release:update` refuses when native changed.

## Commands

| Command | Builds | Copies to the server | Tags (local) |
|---|---|---|---|
| `bun release:apk [--major]` | APK, next minor (or major) | nothing | `vX.Y.0` |
| `bun release:update` | OTA patch + rebuilt APK | nothing | `vX.Y.Z+1` |
| `bun release:update --minor` | OTA minor + rebuilt APK | nothing | `vX.Y+1.0` |
| `bun ship` | `release:update` (patch only) | prod's releases (`bun play releases --stack=prod`) | `vX.Y.Z+1` |
| `bun release:dev:apk` / `release:dev:update` | the same on the dev track | nothing | `dev-vX.Y.Z` |
| `bun ship:dev` | `release:dev:update` | dev's releases (`bun play releases --stack=dev`) | `dev-vX.Y.Z` |
| `bun play releases [--stack=prod\|dev]` | nothing | staged releases, both stacks unless `--stack` | — |
| `bun play app [--stack=prod\|dev]` | nothing (run `bun run build:server` first) | server **and** releases, both stacks unless `--stack` | — |

- `bun play app` already copies the releases. Don't also run `bun play releases` after it.
- `bun play` without `--stack` touches production. Use `--stack=dev` for dev-only work.
- `bun play` needs the sudo password. The user runs it (`! bun play …`), unless `LUSTRE_SUDO_PASSWORD_FILE` is set.
- Nothing pushes tags for you: `git push origin <tag>`. Pushing a `v*` tag runs `.github/workflows/release.yml`. `dev-v*` tags stay local.

## Patch or minor

- **Patch** (`release:update`): downloads in the background, runs on the next cold start. Quiet, never interrupts a screen.
- **Minor OTA** (`release:update --minor`): phones already on 1.6.0 or later show a full-screen download with progress and restart into it (`shell/UpdateScreen.tsx`).
- **Minor APK** (`release:apk`): needed for native changes. Phones see the install banner on the home screen and in Settings.

## Shipping to production

1. Move `## [Unreleased]` in CHANGELOG.md under the new version and date, and add its compare link. Commit. Write entries for the clinic, not the code: what changed on the phone.
2. If the server changed: `bun run build:server`.
3. `bun release:update [--minor]` (or `bun release:apk`). It needs a clean tree.
4. `git push origin main` and `git push origin v<version>`.
5. The user runs `bun play app` if the server changed, otherwise `bun play releases`. The play deploys the server before it copies the releases, so the server is always ahead of the phones.

## Environment

Read from the root `.env` (Bun loads it):

- `LUSTRE_UPDATES_URL`: the prod stack, `http://<clinic>:3000`. Baked into production APKs.
- `LUSTRE_GLITCHTIP_DSN`: required for production builds, same host.
- `LUSTRE_DEV_UPDATES_URL`: the dev stack, `http://<clinic>:3001`. The dev track uses it instead of `LUSTRE_UPDATES_URL`, both as its OTA source and as the server a dev build opens on, and refuses the clinic's address.

Signing keys: [README.md#release-signing](README.md#release-signing).

## Dev builds and the clinic server

A dev build (`com.lustre.clinic.dev`, "Lustre DEV") connects only to a server whose `health.check` says `environment: development`. The clinic's server says `production`, and one too old to say anything is refused too. Never point a dev build at `:3000`.
