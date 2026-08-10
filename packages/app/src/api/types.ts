import type { AppRouter } from '@mawid/server/src/trpc/router.ts';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

/**
 * The shapes of every procedure's input and output, inferred from the server
 * (SPEC §3). Nothing in this package hand-writes a request or response type;
 * where a screen or a domain component needs to name one, it indexes these.
 *
 *     type Day = RouterOutput['appointment']['byDate'];
 *     type NewAppointment = RouterInput['appointment']['create'];
 *
 * **Dates arrive as strings.** The server returns `Date` objects and there is
 * no transformer on either side, so JSON turns them into ISO strings on the
 * wire while these types still say `Date`. Treat any date field as a string
 * until a transformer lands on the server — see the README.
 */
export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;
