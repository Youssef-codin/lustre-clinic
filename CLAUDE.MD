# Agents — Mawid Development Guide

`docs/SPEC.MD` is authoritative. `docs/PRD.MD` says why. Read the relevant
section before building against it.

## Task completion Requirements

- Always run `bun lint`, `bun typecheck`, `bun test` and `bun format` and make sure they pass before considering a task complete.

## Key Conventions

- DO NOT use any unless strictly needed to.
- **Runtime**: Bun (always use `bun`, not npm/yarn/pnpm)
- **Money is integer piastres.** No floats, no decimal types, anywhere. Parse at
  the boundary, format at the display layer.
- **Timestamps are `timestamptz`. IDs are UUIDv7.**
- **Routers are thin.** Input schema → service call → return. No logic and no
  database access in a router. Services hold the business logic, throw
  `AppError`, and never import tRPC.
- **A module may import another module's service, never its router.**
- **Request/response types are never hand-written.** They are inferred from
  `AppRouter`. Only what inference cannot provide (`ERROR_CODE`, domain enums,
  constants, shared Zod schemas) lives in `packages/shared`.
- **Never log patient data** — no names, phone numbers, notes, or amounts. IDs
  and error codes only. This applies to pino and to Discord alerts.
- **The client localizes from `ERROR_CODE`**, never by parsing server message
  text. Server messages stay English for logs.
