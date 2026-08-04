# Mawid

Clinic management app for a dental practice. React Native client, on-prem server,
Tailscale-only network.

See [`docs/PRD.MD`](docs/PRD.MD) for what it does and why, and
[`docs/SPEC.MD`](docs/SPEC.MD) for how it is built.

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

All three must pass before a task is considered complete.

## Backups

```sh
bun backup                              # dump, verify by restoring, prune
bun restore backups/mawid-....dump      # restore into a scratch db and drop it
bun restore backups/mawid-....dump.enc --key <base64>
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

The second destination is a Drive folder, reached with a **service account** so
nothing has to be re-authorized when the clinic machine reboots unattended.

1. In a Google Cloud project, enable the Drive API and create a service account.
2. Create a JSON key for it. `client_email` and `private_key` go into `.env` as
   `BACKUP_DRIVE_CLIENT_EMAIL` and `BACKUP_DRIVE_PRIVATE_KEY` (keep the `\n`
   escapes; the server unescapes them).
3. Create the backup folder **in a shared drive**, share that drive with the
   service account as Content manager, and put the folder id in
   `BACKUP_DRIVE_FOLDER_ID`.
4. Set `BACKUP_ENCRYPTION_KEY`, or the upload is refused.

A service account has no Drive storage of its own, so a folder in somebody's
personal My Drive fails with `storageQuotaExceeded`. Either use a shared drive
as above, or set `BACKUP_DRIVE_SUBJECT` to a user the service account may
impersonate through domain-wide delegation, so the files count against that
user's quota.

Retention applies off-site exactly as it does locally: same 14/8/12 policy,
and a file whose name does not parse as a dump is never touched.

## Deployment

`docker compose up -d` on the clinic machine brings up Postgres and the server.
The published port binds to the Tailscale interface only — there is no public
ingress, no TLS termination, and no authentication. Reachability on the tailnet
is the authorization model (SPEC §1).
