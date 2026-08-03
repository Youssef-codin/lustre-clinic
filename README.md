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
upload is encrypted with `BACKUP_ENCRYPTION_KEY` and is skipped when no bucket
is configured.

## Deployment

`docker compose up -d` on the clinic machine brings up Postgres and the server.
The published port binds to the Tailscale interface only — there is no public
ingress, no TLS termination, and no authentication. Reachability on the tailnet
is the authorization model (SPEC §1).
