# Releasing

One command ships everything: `bun ship`. There are no other release commands.

## Rules for agents

- **Never run `bun ship` or `bun play` yourself**, not even to test them. They build, tag, push and deploy to the clinic. The user runs them in their terminal with `! bun ship`, and the play asks for the sudo password.
- **Tell the user the exact command to run from the table below, and nothing else.** Don't piece together steps like `release.ts`, `build:server` or `play releases`. `bun ship` already runs them, in the right order.
- **Before a release, the only file to touch is CHANGELOG.md**: lines under `## [Unreleased]`, written for the clinic. Don't move them under a version, add links or date it. `bun ship` does all of that.
- **Never stash, check out or reset to test release scripts.** An older checkout has older scripts, and `bun ship` there is a real release.
- If a ship fails, read its last line. It says what to run next: `bun ship` again, or `bun ship deploy`.

## Commands

| The user wants | They run |
|---|---|
| to release what's on `main` (the usual) | `bun ship` |
| a release the phones take right away (download screen, restart) | `bun ship --minor` |
| a new APK: native dependency, `app.json`, config plugin, a baked-in env var | `bun ship --apk` |
| a breaking change the server and app must ship together | `bun ship --apk --major` |
| to see the next number without changing anything | `bun ship --dry-run` |
| to retry only the deploy, after `bun ship` failed at the sudo prompt or the play | `bun ship deploy` |
| a test build on the dev stack (any branch, no changelog, no push) | `bun ship:dev` (`--apk` for a new dev APK) |

If `bun ship` needs an APK (it says "something native changed"), use `bun ship --apk`.

## What `bun ship` does

1. Stops on uncommitted changes, a branch other than `main`, `main` behind origin, a HEAD that's already released, or an empty `[Unreleased]`.
2. Works out the next number from the tags and `dist/releases`.
3. Moves `[Unreleased]` in CHANGELOG.md under that number and commits `docs(changelog): X.Y.Z`.
4. Builds, signs and stages the OTA update and APK in `dist/releases`, then tags `vX.Y.Z`.
5. Pushes `main` and the tag. GitHub makes the release notes and the wiki page from the tag.
6. Runs `bun play app --stack=prod`: builds the server, deploys and migrates it, then copies the releases. The server always goes first, so phones never get an update ahead of it.

Running it again after a failure picks up where it stopped. A changelog already cut for the number is kept.

## Patch, minor, APK

- **Patch** (`bun ship`): no screen. Phones download it quietly (every 15 minutes while open, and on each return to the app) and switch to it the next time the app comes back on screen: from WhatsApp, the lock screen, or reopened after a swipe away. Phones on 1.6.2 or older still need two trips of 5+ minutes away, or a cold start (restart the phone).
- **Minor** (`bun ship --minor`): phones on 1.6.0 or later show a download screen and restart into it.
- **APK** (`bun ship --apk`): phones show an install banner on the home screen and in Settings.

## Environment

These are read from the root `.env`:

- `LUSTRE_UPDATES_URL`: the prod stack, `http://<clinic>:3000`.
- `LUSTRE_GLITCHTIP_DSN`: required for production builds, same host.
- `LUSTRE_DEV_UPDATES_URL`: the dev stack, `http://<clinic>:3001`, for `bun ship:dev`.
- `LUSTRE_SUDO_PASSWORD_FILE` (optional): a mode-0600 file with the sudo password, so the play doesn't prompt.

Signing keys: [README.md#release-signing](README.md#release-signing). Background on updates and versions: [README.md#releases](README.md#releases).
