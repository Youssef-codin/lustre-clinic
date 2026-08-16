import type { AppRouter } from '@lustre/server/src/trpc/router.ts';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

// The shapes of every procedure's input and output, inferred from the server's
// `AppRouter` (SPEC §3); screens and domain components index these instead of
// hand-writing a request or response type.
//
// Dates arrive as ISO strings on the wire (there is no transformer on either
// side), while these types still say `Date` — treat any date field as a string
// until a transformer lands on the server.
export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;
