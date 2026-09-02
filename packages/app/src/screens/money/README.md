# `screens/money`

The Money tab: one dashboard of what the clinic charged, collected and is owed.
Built against the frozen [`ui/`](../../components/ui/README.md) and
[`theme/`](../../theme/README.md), per Component Inventory §9 and §10.

```
MoneyCluster            goHome + the debtor row's route out; no routes of its own
└── MoneyScreen         money-dashboard-v2.html: hero, stats, takings, debtors
```

**This cluster reads and never writes.** It was three panes — dashboard → a
patient's unpaid visits → one visit's payment history — and the middle two
existed only because `visit.recordPayment` took a `visitId`, so a visit had to
be picked before money could be taken. `balance.settle` allocates a
patient-level payment across their unsettled visits oldest-first, so nothing
has to be picked and both panes are gone. Tapping a debtor opens that patient's
**record**, which is where the payment sheet lives and where per-visit history
already was. See `DECISIONS.md`, *A payment is taken against a patient*.

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

- The dashboard's debtor total is the report's `total`, and it is **hidden while
  searching** rather than recomputed over the filtered rows. A total that shrank
  as you typed would read as the clinic being owed less than it is.
- Each debtor row's amount is the standing balance `balance.outstanding`
  derived. The row never adds anything up.
- After a payment — taken on the patient's record, not here — nothing patches a
  balance locally. The server broadcasts `visit:updated` per allocated visit and
  [`api/live.ts`](../../api/live.ts) invalidates the `balance` path, so this
  dashboard is re-read from the server whichever phone took the money. That was
  already the path a payment on the *other* phone used; there is no longer a
  local special case beside it.
- **There is no arithmetic on money left in this cluster.** The overpayment
  clamp moved to the patients cluster with the sheet. What remains is ratios —
  the collection rate and the takings percentages, neither of which is ever
  displayed as money — and `sortDebtors`, which compares two balances the server
  derived.

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
| Overpayment | does not exist (§7.6), and nothing on these screens can cause one — the entry lives with the sheet on the patient's record, and `balance.settle` refuses one outright. |

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
- **empty** — "No outstanding patients" and "No patients found" — two different
  sentences, because they are two different facts: a clinic that is owed nothing
  is not a search that matched nothing.

The dashboard's three queries are independent, so a takings card that failed
does not take the hero down with it.

There is no mutation here to have a pending state. The one write the app makes
about money is `balance.settle`, on the patient's record — its pending, failure
and double-tap handling live with the sheet, in
[`screens/patients`](../patients/README.md).

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
- **`balance.outstanding` takes no argument**, so the debtor search filters the
  report client-side.
- **`balance.byPatient` has no caller on the wire.** Deleting
  `PatientBalanceScreen` took its only one. The procedure is kept deliberately:
  it is the read that pairs with `balance.settle` — the same query the
  allocation runs — and the sheet can only report a split *after* the money is
  taken. A desk that wants to see where a payment will land before pressing the
  button needs exactly this. If that never gets built, delete it rather than
  leaving it here indefinitely.
- **`--discount` is left out**: it has no rule saying when it applies.

## Seeing it

The app shell mounts the cluster on the Money tab — `bun emu`, then Money. The
server has to be up: every figure on these screens now comes off it, and the
loading and failure states are what an unreachable clinic actually produces.

## Verified

`bun test` — 656 pass. [`money.test.ts`](./money.test.ts) covers everything the
client still decides here: the piastre conversion, the compact form, the
currency position, the collection rate on a period that collects more than it
charges, the period pills as date ranges, and the payment-method narrowing. The
whole-pounds guard and the overpayment clamp went to the patients cluster with
the sheet and are covered in `patients.test.ts`. The derived balances live in
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
worktree. What that leaves unverified: the icon swap's optical sizes, and a
debtor row landing on the patient's record with the tab bar following it.

The pill-over-a-pushed-pane observation is **closed, not fixed**: there is no
pushed pane in this cluster any more, so `searchVisible` is gone rather than
defended. The layout itself was seen before, on the Android
emulator (`lustre_note`, API 36) — every period, the sort menu, the search
filter and its empty state, and the pill docking and settling over repeated
cycles in both directions. Never seen on a physical device: `shadow.hero` and
`shadow.dock` are multi-layer `boxShadow`, which Android has historically
flattened to a single elevation, and `experimental_backgroundImage` on the hero
is exactly what its name says.
