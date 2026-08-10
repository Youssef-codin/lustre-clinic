# BLOCKED

Component Inventory §10. Each entry is what was needed, which screen needed it,
and the shape it was expected to have. Read this before code review: every entry
is either promoted into `ui/`, `domain/` or the server before the merges, or
resolved as genuinely cluster-local and left alone.

---

## Money cluster — `packages/app/src/screens/money`

### 1. `domain/MoneyValue` does not exist

**Needed by:** every money screen. §10 lists it as pre-built and frozen; §7.12
makes it the only place money is formatted.

**Found:** `packages/app/src/components/domain/` does not exist at all. Neither
does `domain/PatientRow` or `domain/StatusPill`, the other two the rule freezes.

**Built:** `money/_LocalMoneyValue.tsx`, with `formatEgp` beside it. Expected
prop shape, unchanged from what the money screens pass today:

```ts
type MoneyValueProps = {
    amount: number;              // integer piastres, exactly as the server sent it
    variant?: TextVariant;       // defaults to 'amount'
    tone?: TextTone;
    weight?: TextWeight;
    compact?: boolean;           // 142.6k — hero and stat cards only (§7.12)
    locale?: 'en' | 'ar';        // EGP 2,600 / 2,600 ج.م (§7.13)
    showCurrency?: boolean;      // off where a column already carries EGP
};
```

**To promote:** move the file to `components/domain/MoneyValue.tsx` and delete
the local re-export. Nothing else in the cluster touches formatting.

### 2. No tRPC client and no connection hook

**Needed by:** every screen in the cluster. §10 freezes both; Spec §18 puts them
at F2, which has not landed — `packages/app` has no `@trpc/client`, no
`@tanstack/react-query` and no `src/api`.

**Built:** `money/_LocalMoneyApi.ts` — the four procedures the cluster calls,
backed by fixtures with simulated latency and a failure switch, behind hooks
shaped exactly like the TanStack Query bindings (`{ data, isLoading, error,
refetch }` / `{ mutate, isPending, error }`). Swapping to the real client is a
rename at each call site, not a rewrite:

| local | real |
| --- | --- |
| `useOutstanding()` | `trpc.balance.outstanding.useQuery()` |
| `useBalanceSummary(range)` | `trpc.balance.summary.useQuery(range)` |
| `useVisitsByPatient(id)` | `trpc.balance.byPatient.useQuery({ patientId })` |
| `useVisit(id)` | `trpc.visit.byId.useQuery({ id })` |
| `useRecordPayment()` | `trpc.visit.recordPayment.useMutation()` |

### 3. Response types are hand-mirrored, not inferred from `AppRouter`

**Why:** Spec §3 says the app imports `type { AppRouter }` from the server
package, and `metro.config.js` is already set up for it — but
`packages/app/package.json` does not depend on `@mawid/server`, so the import
does not resolve. Adding the dependency edits `package.json` and `bun.lock`,
which is a conflict in four branches at once (§10).

**Built:** the interfaces in `_LocalMoneyApi.ts` are copied from
`balance.service.ts` and `visit.service.ts` by hand, with `Date` fields typed as
ISO `string` — there is no `superjson` transformer on `trpc/init.ts`, so dates
arrive as strings over the wire.

**To resolve:** add `@mawid/server` to the app's dependencies on main, then
replace the block with `inferRouterOutputs<AppRouter>`. Until then these types
can drift from the server and nothing will catch it.

### 4. No navigator

**Needed by:** dashboard → patient balances → visit payment history.

**Built:** `MoneyCluster.tsx` holds the route in local state and uses
`ui/PushView` for the transition. It is three panes, not a navigator: no deep
links, no hardware back, no restored scroll on the dashboard.

**To resolve:** F3. Each screen already takes its ids and its `onBack` as props,
so they drop onto a real stack unchanged.

### 5. No `balance.takings` — takings by payment method

**Needed by:** `domain/TakingsCard` (Inventory §5), the third card on the money
dashboard: a total, then one row per method with a bar, a travelling percentage
and an amount.

**Found:** nothing returns payments grouped by method. `balance.summary` gives
`{ charged, collected, difference }` for a period and `stats.summary` gives
`topProcedures`, neither of which can be split by method client-side.

**Expected shape:**

```ts
balance.takings  q  ({ from, to, offsetMinutes })
  → { total: number, byMethod: { method: PaymentMethod, amount: number, count: number }[] }
```

Grouped over `payments.paid_at` in the period, same attribution as
`balance.summary.collected`, so the two always agree. Zero-amount methods
included, so the card's rows do not move between periods.

**Built:** the stub serves it. The card is real; the endpoint is not.

### 6. `balance.outstanding` takes no period, no search and no page

**Needed by:** the debtors list and its search field.

**Found:** the procedure returns every patient with a balance, ordered by amount
descending, in one array. The money dashboard filters by period tab and by a
search string.

**Worked around:** the period tabs drive the hero, the stat cards and the
takings card — all three come from `balance.summary`, which is a range query —
and the debtors list is explicitly *the standing balance*, which is what §10
defines it as and what the design's "Outstanding 12 days" caption says. So the
tabs correctly do not filter it, and the search filters client-side over the
returned array.

**Watch:** unbounded. A clinic with 2,000 debtors ships 2,000 rows to a phone.
Wants a `limit`/`cursor` before it is real.

### 7. Overpayment is clamped on the client only

**§7.6 and §7.12:** overpayment does not exist; the amount is clamped to the
amount due and no refund state is drawn. `RecordPaymentSheet` does that, and
toasts, exactly as `visit-payment.html` does.

**But:** `visit.recordPayment` accepts any positive amount up to
`MAX_AMOUNT_PIASTRES` and inserts it. Two phones on one tailnet with no auth and
no optimistic concurrency means a balance can be settled twice — the second
client clamps against a figure that was already stale when it rendered.

**Wants:** the clamp in `visitService.recordPayment`, against the balance read
inside the same transaction, rejecting with `INVALID_AMOUNT` (or clamping and
returning the visit). A client-side rule is a UI courtesy, not an invariant.

### 8. No payment history per patient

**Needed by:** "payment history" on the patient balance screen.

**Found:** payments only come back nested inside `visit.byId`. Showing a
patient's payments across visits means one call per visit.

**Worked around:** the history is shown per visit, one screen down, which is
where `visit.byId` already provides it. The patient screen lists that patient's
*visits* with a balance (`balance.byPatient`) and drills in.

**Would want:** `balance.paymentsByPatient q ({ patientId })` → payments with
their visit ref and date, newest first, if the patient-level history is meant to
be a single list.

### 9. `--older` and `--discount` left out

**§3.3 and the theme README:** `--discount` is fully specified in CSS and used
by no markup; `--older` is `success` at a second value with no rule saying when
it applies. Neither is a token, and no rule exists for when a balance becomes
"older". The `HeroCollectionCard` and `StatCard` variants that use them are not
built.

**Wants:** a rule — at what age does an outstanding balance change colour, and
what is the discount stat counting — before either ships.

### 10. No locale context

**Needed by:** `MoneyValue`, which is bilingual by §7.13 (`EGP 2,600` /
`2,600 ج.م`).

**Found:** F4, the localisation scaffold, has not landed. There is no locale
provider and `I18nManager.allowRTL` is never called, so the app is English and
LTR whatever the device says.

**Built:** `MoneyValue` takes `locale` and defaults to `'en'`. Nothing passes it
yet. When the provider lands the default becomes a `useLocale()` read and every
call site is already correct.

### 11. Not mounted

`App.tsx` still mounts `GalleryScreen` and is shared by four branches, so it is
left alone. To see the cluster on a device, one line:

```diff
-import { GalleryScreen } from './src/screens/dev/GalleryScreen';
+import { MoneyCluster } from './src/screens/money';
```

### 12. The app could not compile against `@mawid/shared` — one-line tsconfig fix applied

**This one is an edit outside the cluster.** It is flagged here rather than left
alone because no screen cluster can import the contract without it, so all four
branches hit it, and three of them would otherwise duplicate the enums locally —
which is the drift Spec §3 exists to prevent.

**Symptom:** any app file importing `@mawid/shared` fails with three copies of

```
../shared/src/index.ts(9,15): error TS5097: An import path can only end with a
'.ts' extension when 'allowImportingTsExtensions' is enabled.
```

**Cause:** `packages/shared/src/index.ts` re-exports with explicit `.ts`
extensions. `tsconfig.base.json` sets `allowImportingTsExtensions: true`, which
is why the server compiles; `packages/app/tsconfig.json` extends
`expo/tsconfig.base` instead and never inherited it. Nothing in the app imported
the shared package until now, so it had not surfaced.

**Applied:** `allowImportingTsExtensions: true` in `packages/app/tsconfig.json`.
Additive, matches the repo's own base config, and `bunx tsc --noEmit` is clean
with it. Expect the same one-line diff from the other three clusters — take it
once on main.

### 13. No icons, no safe-area insets

Both are noted as not-done in `ui/README.md`. The money screens pass text glyphs
where the designs draw icons — the method rows in `TakingsCard` especially — and
the payment sheet clears the home indicator with `ui/Sheet`'s fixed padding.

### 14. `visit.byId` does not carry the appointment or the patient

**Needed by:** the payment-history screen's header (the visit reference and the
patient's name) and its date line.

**Found:** `visit.byId` returns the `visits` row plus `procedures`, `payments`,
`paidTotal` and `balance`. The `visits` table holds `appointment_id` and the
totals and nothing else — `ref` and `starts_at` are the appointment's, and the
name is the patient's, and the service joins neither.

**Worked around:** the screen takes `visitRef`, `startsAt` and `patientName` as
props. The first two come from the `balance.byPatient` row it was opened from,
which already carries them; the third from the route, which already had it. The
mirrored `VisitDetail` now declares only what the procedure actually returns, and
`money.test.ts` asserts it has not regrown the invented fields — that failure is
invisible to the type system and would only surface at the swap, as a header
falling back to a placeholder and a date rendering `NaN undefined NaN`.

**Would prefer:** `visit.byId` joining the appointment for `ref` and `startsAt`
and the patient for `name`. Every screen that opens a visit wants them, the join
is one the service already does in `balance.byPatient`, and threading them
through a route means a deep link to a visit cannot render its own header.
