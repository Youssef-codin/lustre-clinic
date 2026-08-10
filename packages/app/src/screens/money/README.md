# `screens/money`

The Money cluster: the dashboard, outstanding balances by patient, and payment
history. Built against the frozen [`ui/`](../../components/ui/README.md) and
[`theme/`](../../theme/README.md), per Component Inventory §9 and §10.

```
MoneyCluster            three panes on ui/PushView — there is no navigator yet
├── MoneyScreen         money-dashboard-v2.html: hero, stats, takings, debtors
├── PatientBalanceScreen  that patient's unpaid visits (Spec §10)
└── VisitPaymentsScreen   payment history + the one write this cluster makes
```

## The rule the whole cluster is built around

**Balances are derived server-side, and nothing here recomputes one.**

Spec §10: `balance = charged_total - SUM(payments.amount)`, per visit, derived at
read time and never stored. Every figure on these screens arrives already
computed — `balance.outstanding` for the standing totals, `balance.summary` for
the period figures, `visit.byId` for one visit's payments — and the screens
render what they were given.

Concretely, and deliberately:

- The patient screen's total is read back out of `balance.outstanding`, not
  summed from the visit rows it is showing. Two figures for the same thing
  cannot then drift apart.
- The dashboard's debtor total is the report's `total`, and it is **hidden while
  searching** rather than recomputed over the filtered rows. A total that shrank
  as you typed would read as the clinic being owed less than it is.
- After a payment, nothing patches a balance locally. The cluster bumps a
  `version`, every query re-keys on it, and the server is asked again.
- The only arithmetic on money in the cluster is the overpayment clamp, in
  [`money.ts`](./money.ts), and it is tested.

Ratios are not amounts, so the collection rate and the takings percentages are
computed on screen. Neither is ever displayed as money.

## Money formatting

One place: [`money.ts`](./money.ts), rendered by `MoneyValue`. §7.12 —
integer piastres end to end, whole EGP out, piastres never shown, and no screen
formats money itself.

| | |
| --- | --- |
| Compact (`142.6k`) | the hero and the stat cards **only**. Full amounts everywhere else. |
| Currency | `EGP 2,600` in English, `2,600 ج.م` in Arabic (§7.13). |
| Numerals | Latin in both languages (§7.11), always DM Mono, so amount columns align. |
| Overpayment | does not exist (§7.6). Clamped to the amount due, and the clamp is announced. |

`MoneyValue` renders the figure and the currency as two `Text`s — the figure has
to be mono for the tabular numerals, and `ج.م` has no coverage in DM Mono. The
children are ordered by locale — `[currency, figure]` in English, `[figure,
currency]` in Arabic — and the row is left plain so Yoga's mirroring finishes the
job: the first child takes the left edge under LTR and the right edge under RTL,
which is what makes one order correct in both. The four cases are written out
above the component, because this is easy to get backwards; the reference is
always what `formatEgp` produces as a single string.

## States

§7.14 called the missing loading, failure and stale-data states an acknowledged
gap. Every list and every card here has all three renderings, through
[`LoadState`](./components/LoadState.tsx):

- **loading** — skeleton rows or a skeleton card, pulsing, honouring reduced
  motion
- **error** — the data is *replaced*, never overlaid. A balance that failed to
  refresh but is still on screen looks current, and a stale figure someone acts
  on is the worst outcome available on these screens. Copy comes from
  `ERROR_CODE`, never from the server's message (§4, §14).
- **empty** — "Nothing is outstanding", "Every visit is settled", "No patient
  matches that" — three different sentences, because they are three different
  facts.

The dashboard's three queries are independent, so a takings card that failed
does not take the hero down with it.

Every mutation has a pending state. There is one mutation — `visit.recordPayment`
— and its button carries `loading`, the sheet refuses to dismiss mid-write, and
the fields are disabled while it is in flight. `ui/Button` also swallows a repeat
press for 500ms, which on this screen is the difference between one payment and
two.

## What is missing, and where it is written down

[`BLOCKED.md`](../../../../../BLOCKED.md) at the repo root, entries 1–14 — read
it before reviewing this cluster. The short version:

- `domain/MoneyValue` does not exist, nor does `components/domain/`
- there is no tRPC client, so the cluster runs on `_LocalMoneyApi.ts`, a stub
  with fixtures behind TanStack-Query-shaped hooks
- `balance.takings` (takings by payment method) has no endpoint at all
- the overpayment clamp is client-side only; the server accepts any positive
  amount
- `--older` and `--discount` are left out: neither has a rule saying when it
  applies
- `visit.byId` joins neither the appointment nor the patient, so the visit
  reference, its date and the patient's name are threaded in from the
  `balance.byPatient` row the screen was opened through

The two files named `_Local*` are the §10 escape hatch and are meant to be
deleted, not maintained.

## Seeing it

`App.tsx` is shared by four branches and is left alone. To mount the cluster:

```diff
-import { GalleryScreen } from './src/screens/dev/GalleryScreen';
+import { MoneyCluster } from './src/screens/money';
```

`setStubFailing(true)` from the barrel flips every query to a transport failure,
which is how the error states are looked at rather than reasoned about. The stub
adds 450ms of latency to every call so the pending states are visible.

## Verified

`bun test packages/app` — 40 pass. [`money.test.ts`](./money.test.ts) covers
everything that decides a figure: the piastre conversion, the compact form, the
currency position, the whole-pounds guard, the overpayment clamp, the
collection rate on a period that collects more than it charges, the derived
balances, and the shape of the mirrored contract. There is no renderer in
`bun test`, so the screens themselves are not covered.

`bunx tsc --noEmit` and `bunx biome check` are clean, including the theme's
raw-colour and physical-direction checks.

Not yet seen on a device.
