# Releasing

Details: README.md#releases.

JS-only change: OTA update. Native change (native dep, app.json, config plugin): new APK. `release:update` fails if native changed.

- `bun release:apk`: build + sign APK, stage in dist/releases, tag vX.Y.0 locally.
- `bun release:apk --major`: same, bumps major. Only when server and app must ship together.
- `bun release:update`: OTA update + rebuilt APK, staged, tag vX.Y.Z locally. A patch: phones take it quietly on their next launch.
- `bun release:update --minor`: the same, numbered vX.(Y+1).0. Phones show a download screen and restart into it right away (`shell/UpdateScreen.tsx`). Then `bun play releases`; `bun ship` is patch-only.
- `bun play releases`: copy dist/releases to the clinic server. Needs sudo password; the user runs it.
- `bun ship`: release:update then play releases.
- `git push origin <tag>`: nothing else pushes the tag.
- Dev track: `release:dev:apk`, `release:dev:update`, `ship:dev`. Stages dist/releases-dev, tags dev-vX.Y.Z. Needs `LUSTRE_DEV_UPDATES_URL` (the dev stack, `:3001`): a dev build takes its updates from it and connects to it, and the script refuses the clinic's address.

Before tagging, move `## [Unreleased]` in CHANGELOG.md under the new version and date, and add its compare link. Write entries for the clinic, not the code: what changed on the phone.

Pushing a `v*` tag runs `.github/workflows/release.yml`: it publishes that version's section as the GitHub release notes and regenerates the wiki's Changelog pages (one per major). Edit CHANGELOG.md, never the wiki. To re-sync the wiki after fixing an old entry, run the workflow by hand.

New APK: `bun release:apk` → `git push origin <tag>` → `bun play releases`.

Requires a clean tree, and `LUSTRE_UPDATES_URL` + `LUSTRE_GLITCHTIP_DSN` in .env. Signing keys: README.md#release-signing.
