# Lustre

Dental clinic app. Bun monorepo: `packages/app` (Expo), `packages/server` (tRPC), `packages/shared`.
Full docs on Notion: https://app.notion.com/p/3b7541c6b44181d8a6aee73ec9b34dcc

Read the matching file before working in that area:
- Frontend (`packages/app`): [packages/app/FRONTEND.md](packages/app/FRONTEND.md)
- Backend (`packages/server`, `packages/shared`): [packages/server/BACKEND.md](packages/server/BACKEND.md)
- Releasing an APK or OTA update: [infra/RELEASING.md](infra/RELEASING.md)
- Server, deploy, Tailscale, backups: [infra/README.md](infra/README.md)
- Product: [PRODUCT.md](PRODUCT.md)

## Always

- Use `bun` only. Never npm, yarn or pnpm.
- Before calling a task done, run `bun lint`, `bun typecheck`, `bun test` and `bun format`, and make sure they all pass.
- Then run `bun fallow`. It won't pass clean, and that's expected. Look at what it reports in the files you touched. Fix cheap, clear wins now: duplicated code, dead code you created. Leave big refactors (splitting files, breaking import cycles) for later, and mention them in your report.
- Money is integer piastres everywhere: no floats, no decimal types. Parse at the boundary, format at display.
- Never log patient data: no names, phones, notes or amounts. IDs and error codes only. This applies to pino, Discord alerts and GlitchTip (allow-list, never strip).
- No `any` unless strictly needed.
- Comment sparingly. Write a comment only for what the code can't say: a non-obvious constraint, a spec reference, or why the obvious approach was rejected. Default to none.

## Git

- Work on the branch that is already checked out. Never `git checkout -b`. Commit, push, and open the PR against `main`.
- Once the PR is open, comment `@coderabbitai review` (it doesn't review on its own) and wait for it. Fix what genuinely needs fixing, then report back. The user does the final review.
