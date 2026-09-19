# Lustre

Clinic management app for a dental practice. React Native client, on-prem server,
Tailscale-only network.

The PRD (what it does and why) and the technical spec (how it is built) live on
[Notion](https://app.notion.com/p/3b7541c6b44181d8a6aee73ec9b34dcc).

## Layout

```
packages/
├── shared/   # ERROR_CODE, domain enums, constants — the hand-written contract
├── server/   # Bun + tRPC + Postgres 17 (Drizzle over postgres.js)
└── app/      # React Native (Expo)
```

Request and response types are not hand-written. They flow from the inferred
`AppRouter` type, which `packages/app` imports from `packages/server`.

## Running it

```sh
bun install

cp .env.example .env          # set POSTGRES_PASSWORD
docker compose up -d db       # Postgres 17

bun db:migrate                # apply migrations
bun dev                       # server on :3000
```

Then, in `packages/app`:

```sh
bun start
```

## Checks

```sh
bun lint
bun typecheck
bun test
```

All three must pass before a task is considered complete. CI runs the same three
on every push (`.github/workflows/ci.yml`).

### The test database

The suite runs against a real Postgres — the rules worth testing are the ones
Postgres enforces — and it **truncates every table between tests**. It therefore
runs against its own database, never the one `.env` points at. Create it once:

```sh
docker compose exec db createdb -U lustre lustre_test
```

`bun test` loads `packages/server/.env.test` through a preload
(`bunfig.toml`), so the safe database is the default however the runner is
invoked. `assertTestDatabase` in `packages/server/tests/helpers/db.ts` is the
backstop: it refuses to start against any database whose name does not end in
`_test`.

The backup suite shells out to `pg_dump` and `pg_restore`. Without them on PATH
the restore test — the only proof a dump is usable — skips locally, and fails
outright in CI rather than skipping silently.

## Backups

```sh
bun backup                              # dump, verify by restoring, prune
bun restore backups/lustre-....dump      # restore into a scratch db and drop it
bun restore backups/lustre-....dump.enc --key <base64>
```

`pg_dump` and `pg_restore` must be on PATH and must be version 17. The server
image installs them (see `Dockerfile`); on a dev machine install your
distribution's `postgresql-client`, or set `PG_BIN_DIR`. Without them the backup
job fails loudly and its tests skip.

Every run is verified by restoring the dump into a scratch database and
comparing row counts — an unverified dump is not a backup (SPEC §16). Off-site
upload is encrypted with `BACKUP_ENCRYPTION_KEY` and is skipped when no
destination is configured.

### Off-site copies (Google Drive)

The normal destination is a folder created in the doctor's own Drive through a
one-time OAuth sign-in. It works with personal Gmail and Google Workspace and
uses only `drive.file`, so Lustre cannot browse unrelated Drive files.

1. In a Google Cloud project, enable the Drive API, configure the OAuth consent
   screen, and create a **Desktop app** OAuth client.
2. On the operator's machine, set `BACKUP_DRIVE_OAUTH_CLIENT_ID` and
   `BACKUP_DRIVE_OAUTH_CLIENT_SECRET`, then run `bun drive:authorize`. Open the
   printed URL, sign in as the doctor, and accept the one requested scope. Set
   `BACKUP_DRIVE_LOGIN_HINT` first if account selection could be ambiguous.
3. Copy the four printed `BACKUP_DRIVE_*` lines into the clinic server's private
   stack environment (`/opt/lustre-prod/.env`, mode `0600`). Clear the terminal
   after copying them and restart the server.
4. Set `BACKUP_ENCRYPTION_KEY`, or off-site upload is refused. Run
   `docker compose run --rm server backup` once and confirm the encrypted file
   appears in the new **Lustre Clinic Backups** folder.

For personal Gmail, use an External audience and move the consent app to **In
production**: Testing grants expire after seven days. A one-clinic personal-use
app using the non-sensitive `drive.file` scope can remain unverified, although
Google may show an unverified-app warning. For Workspace, an organization-owned
project may use an Internal audience; an administrator can still restrict the
app.

The refresh token is stored only in the clinic's private environment file.
Short-lived access tokens are cached in memory and never written to disk. If
Google returns `invalid_grant` after revocation or expiry, Discord receives
`backup.drive_reauthorization_required`; rerun `bun drive:authorize`, replace
the refresh token it prints, and restart the server. Set the existing
`BACKUP_DRIVE_FOLDER_ID` while rerunning so the flow keeps using the same folder.

The old service-account fields remain as a Workspace-only compatibility path.
They still require a shared drive or domain-wide delegation via
`BACKUP_DRIVE_SUBJECT`; they do not work with personal My Drive. If any OAuth
field is present, OAuth must be complete and takes precedence rather than
silently falling back to the service account.

Retention applies off-site exactly as it does locally: same 14/8/12 policy,
and a file whose name does not parse as a dump is never touched.

## Deployment

`docker compose up -d` on the clinic machine brings up Postgres and the server.
The published port binds to the Tailscale interface only — there is no public
ingress, no TLS termination, and no authentication. Reachability on the tailnet
is the authorization model (SPEC §1).
