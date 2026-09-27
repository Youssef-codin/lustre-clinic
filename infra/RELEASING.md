# Releasing

Details: [README.md#releases](README.md#releases). Every script: [README.md#scripts](README.md#scripts).

JS-only change: OTA update. Native change (native dep, app.json, config plugin, an env var baked into the build): new APK. `release:update` refuses when native changed.

## Commands

`bun ship` is the release. The rest are the steps it runs, for when one has to be run alone.

| Command | Does |
|---|---|
| `bun ship` | OTA patch, start to finish (below) |
| `bun ship --minor` | the same, as a minor the phones take now |
| `bun ship --apk [--major]` | the same, as a new APK |
| `bun ship --dry-run` | the number, and whether the server deploys. Changes nothing |
| `bun ship deploy [--server]` | only the deploy, again: after a failed play, or to force the server (`--server`) |
| `bun ship:dev [--apk]` | the dev track to the dev stack: no changelog, no push, any branch |
| `bun release:update [--minor]` / `release:apk [--major]` | the build step alone: builds, stages, tags locally |
| `bun play releases [--stack=prod\|dev]` | copies the staged releases, both stacks unless `--stack` |
| `bun play app [--stack=prod\|dev]` | deploys `dist/lustre` **and** copies the releases. Run `bun run build:server` first |

- `bun play` without `--stack` touches production. Use `--stack=dev` for dev-only work.
- `bun play` (and so `bun ship`) needs the sudo password. The user runs it (`! bun ship`), unless `LUSTRE_SUDO_PASSWORD_FILE` is set.
- Pushing a `v*` tag runs `.github/workflows/release.yml`, which fails if CHANGELOG.md has no section for it. `dev-v*` tags stay local.

## Patch or minor

- **Patch** (`release:update`): downloads in the background. It runs when the app is next opened after being away 5 minutes or more (from 1.6.1), or on a cold start. Swiping the app away is not a cold start (the notification listener keeps it alive); Force stop is. A quicker trip away, like the reminders' hop to WhatsApp, never reloads. Returning after 5 minutes also checks for new updates, since a phone that is never swiped away never cold-starts.
- **Minor OTA** (`release:update --minor`): phones already on 1.6.0 or later show a full-screen download with progress and restart into it (`shell/UpdateScreen.tsx`).
- **Minor APK** (`release:apk`): needed for native changes. Phones see the install banner on the home screen and in Settings.

## Shipping to production

Write the `[Unreleased]` entries for the clinic, not the code: what changed on the phone. Merge to `main`, pull, then `bun ship` (`scripts/ship.ts`):

1. Refuses a dirty tree, a branch other than `main`, a `main` behind origin, or a HEAD that is already a release.
2. Asks `release.ts next` for the number.
3. Moves `[Unreleased]` in CHANGELOG.md under it, with the date and compare links, and commits `docs(changelog): X.Y.Z`. Refuses an empty `[Unreleased]`.
4. Builds, stages and tags (`release.ts`, told the number it must come to).
5. Pushes `main` and the tag.
6. Deploys. If `packages/server`, `packages/shared` or `bun.lock` changed since the previous release: `bun run build:server`, then `play app`. Otherwise `play releases`. The play deploys the server before it copies the releases, so the server is always ahead of the phones.

Run again after a failure, it picks up where it stopped: a changelog already cut for the number is kept. A failed deploy is `bun ship deploy`.

## Environment

Read from the root `.env` (Bun loads it):

- `LUSTRE_UPDATES_URL`: the prod stack, `http://<clinic>:3000`. Baked into production APKs.
- `LUSTRE_GLITCHTIP_DSN`: required for production builds, same host.
- `LUSTRE_DEV_UPDATES_URL`: the dev stack, `http://<clinic>:3001`. The dev track uses it instead of `LUSTRE_UPDATES_URL`, both as its OTA source and as the server a dev build opens on, and refuses the clinic's address.

Signing keys: [README.md#release-signing](README.md#release-signing).

## Dev builds and the clinic server

A dev build (`com.lustre.clinic.dev`, "Lustre DEV") connects only to a server whose `health.check` says `environment: development`. The clinic's server says `production`, and one too old to say anything is refused too. Never point a dev build at `:3000`.
