# Releasing

Details: README.md#releases.

JS-only change: OTA update. Native change (native dep, app.json, config plugin): new APK. `release:update` fails if native changed.

- `bun release:apk`: build + sign APK, stage in dist/releases, tag vX.Y.0 locally.
- `bun release:apk --major`: same, bumps major. Only when server and app must ship together.
- `bun release:update`: OTA update + rebuilt APK, staged, tag vX.Y.Z locally.
- `bun play releases`: copy dist/releases to the clinic server. Needs sudo password; the user runs it.
- `bun ship`: release:update then play releases.
- `git push origin <tag>`: nothing else pushes the tag.
- Dev track: `release:dev:apk`, `release:dev:update`, `ship:dev`. Stages dist/releases-dev, tags dev-vX.Y.Z.

New APK: `bun release:apk` → `git push origin <tag>` → `bun play releases`.

Requires a clean tree, and `LUSTRE_UPDATES_URL` + `LUSTRE_GLITCHTIP_DSN` in .env. Signing keys: README.md#release-signing.
