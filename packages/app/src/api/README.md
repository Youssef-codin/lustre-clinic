# `api/`

The tRPC client, the query cache, and the connection state. SPEC §4, §13, §14.

```tsx
import { useTRPC, useConnection, classifyError, isSlotOverlap } from '../api';
```

The barrel is the entry point. Nothing outside this folder imports a file inside
it, and nothing outside it constructs a client, a `QueryClient` or a URL.

## Reading

```tsx
const trpc = useTRPC();
const day = useQuery(trpc.appointment.byDate.queryOptions({ date, branchId }));
```

`useTRPC()` returns the typed options proxy. Every procedure in
[`AppRouter`](../../../server/src/trpc/router.ts) is on it, inputs and outputs
inferred — nothing in this package hand-writes a request or response type (§3).
Where a name is needed, index the inferred maps:

```ts
import type { RouterInput, RouterOutput } from '../api';

type Day = RouterOutput['appointment']['byDate'];
type NewAppointment = RouterInput['appointment']['create'];
```

## Writing

```tsx
const trpc = useTRPC();
const queryClient = useQueryClient();

const book = useMutation(
    trpc.appointment.create.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries(trpc.appointment.pathFilter()),
        onError: (error) => {
            if (isSlotOverlap(error)) return setConflict(true);
            toast(messageFor(classifyError(error).code));
        },
    }),
);

<Button label="Book" loading={book.isPending} onPress={() => book.mutate(input)} />;
```

Two rules on writes, both from §14:

- **Mutations are never retried.** A silent retry of `appointment.create` after
  a timeout books the patient twice. `retry: false` is set on the defaults.
- **A failed write is shown as failed.** Nothing is queued for later. Pass
  `loading` to the button and surface the error — the secretary must not tell a
  patient they are booked when they are not.

## Errors

`classifyError(error)` is the only thing that reads a failure. Server messages
stay English for logs; the client localizes from `code` and never parses text
(§4).

| `kind` | Means | Screen does |
| --- | --- | --- |
| `offline` | Neither address answered — the PC is off, or the phone is off the tailnet | Cached reads, failed writes, offline banner |
| `timeout` | The address answered before, but this call ran past `timing.requestMs` | Same as offline, with a retry |
| `server` | The server broke: `INTERNAL`, `DB_UNAVAILABLE`, 5xx | Generic failure. `reportable` — §17 wants this one |
| `constraint` | The server refused for a domain reason | A specific sentence per `code` |
| `validation` | Bad input: `VALIDATION`, `INVALID_PHONE`, `INVALID_AMOUNT` | Point at the field |
| `notFound` | The row is gone | Back out of the screen |

`isSlotOverlap(error)` names the one that matters most: `SLOT_OVERLAP` is the
Postgres exclusion constraint refusing a double booking (§5), raised while the
secretary is standing in front of the patient. It needs its own message, not a
generic one.

Only `kind: 'server'` and `unknown` carry `reportable: true`. A double booking or
a missing required answer is an outcome, not an incident, and §17 keeps them out
of GlitchTip.

## Connection

```tsx
const { status, isStale, address, lastOnlineAt, retry } = useConnection();
```

`status` is `unknown | probing | online | offline`. `isStale` is separate and is
not an error: it means the last successful exchange is older than
`timing.staleAfterMs` (two minutes, the same as `staleTime`), so what is on
screen may have moved. That is the §7.14 stale-data indicator's input. The
indicator itself is not built here.

The state is fed by real traffic, not a poller: every request through the link
reports whether the server answered. A 4xx or a 5xx still counts as online — the
connection is fine and the failure belongs to the procedure.

## Where the server is

`app.json` → `extra.server`:

```json
"extra": { "server": { "lan": "http://192.168.1.20:3000", "tailscale": "http://clinic-pc.tailnet.ts.net:3000" } }
```

That is the one place to change the address, and it is what a dev machine edits.
Both are `null` in the repo on purpose: a checked-in default would be someone
else's LAN.

At runtime, onboarding (F1) calls `setServerAddresses({ lan, tailscale })`,
which is §14's "both addresses are configured during onboarding". This module
holds no storage — persisting what onboarding collected belongs with onboarding.

Resolution order, per §14: the LAN address with a 500 ms ceiling, then the
MagicDNS hostname with 3 s. Whichever answers is cached for the session. A
request that reaches no server drops the cached address, so the next call
re-probes — that is what covers the phone moving between clinic wifi and the
tailnet. Coming back to the foreground while not online re-probes too.

There is no network-change listener: it would need `@react-native-community/netinfo`,
and the failure-driven re-probe already covers the case that matters. Add one
here if it turns out not to.

## Live updates

`/ws` carries IDs only, never patient data (§13). `ApiProvider` subscribes once
and turns each event into an invalidation, so the two phones agree instead of
being a `staleTime` apart. It is a freshness optimisation over the cache and
never a data path — everything works with the socket down, just staler.

## Timings

All in [`config.ts`](./config.ts). An unreachable clinic costs about ten seconds
end to end: 0.5 s LAN probe, 3 s tailnet probe, one 5 s request, one retry for
reads. Fast enough to read as "the server is off" rather than as a hung app.

## Known gap: dates arrive as strings

There is no transformer on either side, so a `Date` the server returns is an ISO
string by the time it lands, while the inferred type still says `Date`. Calling
`.getTime()` on `appointment.startsAt` compiles and throws.

Treat every date field as a string for now, and parse at the point of use. The
fix is a transformer (superjson or a date-only one) added to `trpc/init.ts` and
to the link together — a contract change, so it lands on `main` per §18, not in
this package.
