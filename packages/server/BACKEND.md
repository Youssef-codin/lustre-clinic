# Backend (packages/server)

Bun + tRPC + Drizzle. Modules live in `src/modules`.

- Routers are thin: input schema → service call → return. A router holds no logic and no database access.
- Services hold the business logic and throw `AppError`. A service never imports tRPC.
- A module may import another module's service, but never its router.
- Never hand-write request/response types. They are inferred from `AppRouter`. `packages/shared` holds only what inference can't give: `ERROR_CODE`, domain enums, constants, shared Zod schemas.
- Server error messages stay in English, for the logs. The client localizes from `ERROR_CODE`.
- Migrations: `bun db:generate`, `bun db:migrate`.
