# Agents — Mawid Development Guide

The docs live on Notion: https://app.notion.com/p/3b7541c6b44181d8a6aee73ec9b34dcc

Two of them are needed before touching `packages/app`:

- **Where the designs live** — https://app.notion.com/p/3b8541c6b441819f9a81f70c0432d313
  The screens are runnable HTML mockups in a local Open Design folder, not in
  Figma. Read the design before building a screen or a shared component.
- **Testing on a real Android phone** — https://app.notion.com/p/3b7541c6b44181508d22e598bab63842
  `bun app` for a cable-attached phone, plus the emulator setup and the ABI trap.

## Task completion Requirements

- Always run `bun lint`, `bun typecheck`, `bun test` and `bun format` and make sure they pass before considering a task complete.

## Branches

**Work on the branch that is already checked out. Never `git checkout -b`.**

Each worktree stays on one long-lived branch. Commit to the branch you found,
push it, open the PR from there against `main`.

## Feature Workflow

1. Build the feature on the checked-out branch, using stacked PRs.
2. Open the PR against `main`.
3. Wait for the automated `opencode` review to finish.
4. Read its comments and fix what genuinely needs fixing.
5. Only then report back to the user — they do the final review.

## Key Conventions

- DO NOT use useEffect unless strictly needed to.
- DO NOT use any unless strictly needed to.
- **Runtime**: Bun (always use `bun`, not npm/yarn/pnpm)
- **Money is integer piastres.** No floats, no decimal types, anywhere. Parse at
  the boundary, format at the display layer.
- **Routers are thin.** Input schema → service call → return. No logic and no
  database access in a router. Services hold the business logic, throw
  `AppError`, and never import tRPC.
- **A module may import another module's service, never its router.**
- **Request/response types are never hand-written.** They are inferred from
  `AppRouter`. Only what inference cannot provide (`ERROR_CODE`, domain enums,
  constants, shared Zod schemas) lives in `packages/shared`.
- **Never log patient data** — no names, phone numbers, notes, or amounts. IDs
  and error codes only. This applies to pino, to Discord alerts, and to
  everything the client sends GlitchTip (§17 — allow-list, never strip).
- **The client localizes from `ERROR_CODE`**, never by parsing server message
  text. Server messages stay English for logs.
