# syntax=docker/dockerfile:1

# The server image. `oven/bun` alone is not enough: SPEC §16 backups shell out
# to pg_dump and pg_restore, and those must be the same major version as the
# Postgres they talk to (17, per §2 and compose.yaml).
FROM oven/bun:1.3-alpine

RUN apk add --no-cache postgresql17-client

WORKDIR /app

# Dependencies are installed against the mounted source at runtime in dev; for
# the clinic machine the repo is the deployment unit (§15), bind-mounted by
# compose. Nothing is copied in here on purpose.

# ENTRYPOINT rather than CMD so `docker compose run server <args>` appends to
# the command instead of replacing it — that is how scripts/backup.ts and
# scripts/restore.ts are run against the live stack.
ENTRYPOINT ["bun"]
CMD ["packages/server/src/index.ts"]
