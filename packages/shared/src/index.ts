/**
 * `@lustre/shared` holds what tRPC inference cannot provide (SPEC §3): the
 * `ERROR_CODE` enum, domain enums, constants, and any Zod schema used by both
 * sides — plus the pure rules the server and the app's demo backend both apply,
 * so the demo cannot drift from the server it stands in for. A rule here reaches
 * for no Bun, `crypto`, Postgres or React.
 *
 * Request and response types are NOT written here. They flow from the inferred
 * `AppRouter` type, which the app imports from the server package.
 */
export * from './answers.ts';
export * from './constants.ts';
export * from './dates.ts';
export * from './enums.ts';
export * from './errors.ts';
export * from './labels.ts';
export * from './money.ts';
export * from './ref.ts';
export * from './reminder.ts';
export * from './settings.ts';
export * from './time.ts';
