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

## The dashboard, against the design

The hero's height is not the design's. Its bottom edge is placed at 58% of the
screen, which is what makes the first screenful the hero, the two stat cards
and the top edge of the takings card — the composition the design reads as, at
the phone size it was drawn for. That is a rule about the device rather than a
height, so it is computed from the window and the card's own offset instead of
hardcoded, with a floor for short screens.

Otherwise `MoneyScreen` is built section for section from
`money-dashboard-v2.html`:
"Finances" and the overflow button, the period pills, the `Stats · <month>`
heading, the black collection-rate hero, the two stat cards, the takings card,
`Who owe` with its total and sort, the search, the debtor list and its footer.

Three places where the design and the system disagreed, and what won:

- **Money is Instrument Sans, bold — the design's face, not §7.11's mono.**
  This was built the other way first, on the strength of §7.11 pinning money to
  DM Mono for tabular alignment, and it was wrong: held next to the design the
  mono reads as a different product. The figures are sans and bold here, and
  this cluster's own `MoneyValue` takes `face="mono"` for the one case §7.11 is actually
  about — a column of amounts that has to align digit for digit. Nothing on
  these screens is that column yet. **`domain/MoneyValue` is still mono**, so
  the day view and the patient rows do not match this cluster; that is a real
  inconsistency and it is the same call, made once, when the two components are
  folded together.
- **The sort control is `ink2`, not the design's green.** The design paints it
  in System B's `--accent`, which §7.1 resolves to A's blue. A blue control
  would be the only blue on a screen of green and orange and would read as a
  bug, so the control is neutral and colour on this screen keeps meaning money.
- **`--older` became a token.** It had no rule saying when it applied; this
  screen is the rule. See the [theme README](../../theme/README.md).

The search pill is the one piece of real behaviour in the layout: it rests in
the list above the first debtor row and docks to a floating pill at the bottom
whenever that slot is below the fold, so it is reachable while you are
scrolling the list it filters. It is an overlay on the screen rather than a
sticky child of the scroller — inside the scroller its docked offset is clamped
by the scroller's own bottom padding instead of by the bottom of the screen,
which is the bug the design's own comments describe hitting. `MoneyScreen` owns
the measurement because only it knows the scroll offset; `DockedSearch` owns the
look.

**There is no docked/resting state.** Position, shadow and scale all come off
one node — `anchor - scrollY`, clamped at the dock line — driven by the scroll
on the native thread. Below the line the clamp reads the line and the pill
sticks; above it the pill rides the list and scrolls away with it.

The lift is spread over the last 56px of the approach: the shadow fades up and
the pill rises from .975 to full size. It is linked to the scroll rather than
run on a timer, so it plays at the speed of the finger, reverses when you
reverse, and has no duration that can fall out of step with the position. The
box itself never changes size — the pill rises off the list rather than growing
out of it. The shadow lives on its own layer inside the pill because a shadow
is not an animatable property, but the view carrying it is.

The pill is white with a hairline, not the design's `surface-2`. The design
rests it on a white page, where that grey reads as a field; ours rests on the
grey `canvas`, where the same grey is invisible. The relationship the design
draws is "a shade away from the page", and on this screen that is white — the
same white as every card around it.

Two bugs got it here, both worth not repeating:

- **`top` cannot go on the native driver.** It is a layout property, so the
  position was recomputed on the JS thread once per scroll event, which lags
  the content on a flick and snaps level when the scroll settles. It reads as
  an ease-in-out, and there is no easing anywhere in the component.
- **Two copies of the scroll position will disagree.** With a `docked` boolean
  computed from a JS copy of the offset while the transform used the native
  value, a flung scroll drops its last JS event: the state said "not docked"
  while the scroll had reached the top, so the pill was positioned for a scroll
  that was no longer true and left the screen for good. One source cannot
  disagree with itself, and a clamp cannot put the pill somewhere it does not
  belong even if a measurement is wrong.

## The rule the whole cluster is built around

**Balances are derived server-side, and nothing here recomputes one.**

Spec §10: `balance = charged_total - SUM(payments.amount)`, per visit, derived at
read time and never stored. Every figure on these screens arrives already
computed — `balance.outstanding` for the standing totals, `balance.summary` for
the period figures, `balance.takings` for the split by method, `visit.byId` for
one visit's payments — and the screens render what they were given.

Concretely, and deliberately:

- The patient screen's total is read back out of `balance.outstanding`, not
  summed from the visit rows it is showing. Two figures for the same thing
  cannot then drift apart.
- The dashboard's debtor total is the report's `total`, and it is **hidden while
  searching** rather than recomputed over the filtered rows. A total that shrank
  as you typed would read as the clinic being owed less than it is.
- After a payment, nothing patches a balance locally. `useRecordPayment`
  invalidates the whole `balance` and `visit` paths on success and the server is
  asked again — a payment three panes deep moves the dashboard behind it.
- The only arithmetic on money in the cluster is the overpayment clamp, in
  [`money.ts`](./money.ts), and it is tested.

Ratios are not amounts, so the collection rate and the takings percentages are
computed on screen. Neither is ever displayed as money. Sorting the debtor list
is the same kind of exception: `sortDebtors` compares two balances the server
derived and never adds one up.

Two figures on the dashboard are the standing ones, not the period's: the
"Total due" card and the total beside "Who owe" both read `balance.outstanding`,
so switching to "Today" moves the hero and leaves them alone. That is
deliberate — an outstanding balance is standing, and a "Total due" that fell to
zero on "Today" would say the clinic is owed nothing.

## Money formatting

One place: [`money.ts`](./money.ts), rendered by `MoneyValue`. §7.12 —
integer piastres end to end, whole EGP out, piastres never shown, and no screen
formats money itself.

| | |
| --- | --- |
| Compact (`142.6k`) | the hero and the stat cards **only**. Full amounts everywhere else. |
| Currency | `EGP 2,600` in English, `2,600 ج.م` in Arabic (§7.13). |
| Numerals | Latin in both languages (§7.11). Instrument Sans by default — the money designs' own face; `face="mono"` opts a genuine amount column into DM Mono. |
| Overpayment | does not exist (§7.6). Clamped to the amount due, and the clamp is announced. |

`MoneyValue` renders the figure and the currency as two `Text`s — they carry
different sizes and often different opacities, and `ج.م` has no coverage in DM
Mono for the callers that ask for it. The children are ordered by locale — `[currency, figure]` in English, `[figure,
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

## Where the data comes from

[`data/`](./data), over the real tRPC client. `data/hooks.ts` wraps `useTRPC()`
and hands back the `{ data, isLoading, error, refetch }` the screens read;
`data/types.ts` infers every shape from `AppRouter` and rewrites the date fields
to strings, which is the one thing inference cannot do while there is no
transformer on the wire.

The cluster ran on `_LocalMoneyApi.ts` until this landed — an in-memory store
whose fixtures were the design's own dataset. A payment recorded against it
updated the screen and was gone on reload, having never reached Postgres. That
file, its `setStubFailing` switch and the `version` counter every screen threaded
are all gone.

`balance.summary` grew `duePatients`, `olderCollected` and `olderVisits`, and
`balance.takings` was written, both in
[`modules/balance`](../../../../server/src/modules/balance). `olderCollected`
is a join of payment date against visit date, **not** `collected - charged` —
the two disagree whenever a period's own work is part-paid, which is most of
them.

## Still open

- **`domain/MoneyValue` is not used here.** This cluster keeps its own
  [`MoneyValue`](./MoneyValue.tsx). The two agree on every rule that decides a
  figure and differ in props: the hero and the stat cards need
  `currencyVariant`, `currencySuffix`, `currencyStyle` and `weight`, and the
  shared component carries none of them and pins DM Mono where these screens are
  drawn in Instrument Sans. Folding them together means widening the shared
  component and re-deciding the face for the day view and the patient rows at
  the same time — a call for whoever owns `components/domain`.
- **The overpayment clamp is client-side only.** The server takes any positive
  amount up to `MAX_AMOUNT_PIASTRES`.
- **`balance.outstanding` takes no argument**, so the debtor search filters the
  report client-side.
- **`visit.byId` joins neither the appointment nor the patient**, so the visit
  reference, its date and the patient's name are threaded in from the
  `balance.byPatient` row the screen was opened through. It also returns the
  payment rows unordered, so the history is sorted newest-first on the screen.
- **`--discount` is left out**: it has no rule saying when it applies.

## Seeing it

The app shell mounts the cluster on the Money tab — `bun emu`, then Money. The
server has to be up: every figure on these screens now comes off it, and the
loading and failure states are what an unreachable clinic actually produces.

## Verified

`bun test` — 580 pass. [`money.test.ts`](./money.test.ts) covers everything the
client still decides: the piastre conversion, the compact form, the currency
position, the whole-pounds guard, the overpayment clamp, the collection rate on
a period that collects more than it charges, the period pills as date ranges,
and the payment-method narrowing. The derived balances moved to
[`tests/balance.test.ts`](../../../../server/tests/balance.test.ts) and
`modules.test.ts`, where they run against real Postgres — asserting a mirrored
copy of that arithmetic only proved the copy agreed with itself. There is no
renderer in `bun test`, so the screens themselves are not covered.

The server suite needs a database of its own to be deterministic; every worktree
otherwise truncates the same one:

```
DATABASE_URL=postgres://lustre:lustre@localhost:5432/lustre_<name>_test bun test
```

`bun typecheck`, `bun lint` and `bun format` are clean, including the theme's
raw-colour and physical-direction checks.

**Not seen on a device since the rewiring** — the emulator belongs to another
worktree. What that leaves unverified: the icon swap's optical sizes, the "Open
patient record" button against the mockup, and the search pill no longer
rendering under a pushed pane. The layout itself was seen before, on the Android
emulator (`lustre_note`, API 36) — every period, the sort menu, the search
filter and its empty state, and the pill docking and settling over repeated
cycles in both directions. Never seen on a physical device: `shadow.hero` and
`shadow.dock` are multi-layer `boxShadow`, which Android has historically
flattened to a single elevation, and `experimental_backgroundImage` on the hero
is exactly what its name says.
