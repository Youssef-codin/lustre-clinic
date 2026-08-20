# Agents — Lustre Development Guide

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

- DO NOT use try and catch unleses specifically needed to.
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
- **Always use the logger, never `console.*`.** On the server that is the pino
  `logger` from `packages/server/src/logger.ts`, which carries the level and the
  redaction list; `console.log` bypasses both. This includes logging added while
  debugging — it goes through the logger too, and is removed before the work is
  reported done. `console.log` must never reach a commit.
- **Never log patient data** — no names, phone numbers, notes, or amounts. IDs
  and error codes only. This applies to pino, to Discord alerts, and to
  everything the client sends GlitchTip (§17 — allow-list, never strip).
- **The client localizes from `ERROR_CODE`**, never by parsing server message
  text. Server messages stay English for logs.
- **Icons come from the icon library. Never hand-draw one.** `lucide-react-native`
  is installed and is the default; `@expo/vector-icons` covers the brand glyphs
  lucide has no answer for, like WhatsApp. Do not write `<Path>`, `<Circle>` or
  `<Rect>` to make an icon — not to match a mockup, not because the name is hard
  to find, not "just this one". A hand-drawn icon has no consistent stroke,
  optical size or grid, and every one of them is a thing nobody can restyle
  later. If the design shows a glyph the library does not have, pick the nearest
  one and note it in `BLOCKED.md` rather than drawing it. The only SVG the app
  draws directly is the brand artwork in `packages/app/assets/brand`.

## Code Comment Rules
- Never describe *what* a line of code does mechanically (e.g., do not add `// loop over array`).
- Only use comments to explain complex business rules, non-obvious mathematical formulas, or edge cases.
