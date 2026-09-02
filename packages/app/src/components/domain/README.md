# `domain/`

Components that know what a patient, an appointment and a balance are.
Component Inventory §2 and §5.

```tsx
import { MoneyValue, PatientRow, StatusPill, TimeValue } from '../components/domain';
```

`ui/` is the design system and knows nothing about Lustre; the moment a component
needs to know that an appointment has a status or that a balance is in piastres,
it lives here. `domain/` composes `ui/` and the theme, and may import
`@lustre/shared` and types inferred from `AppRouter`. The barrel is the only entry
point.

These are here because more than one of the four screen clusters needs them.
Everything else in §5 belongs to whichever screen builds it first.

`patientDraft` and `money` are the two things here that are not components, and
the two imported by their own path rather than through the barrel. See the
bottom of this file.

## `MoneyValue`

Every amount in the app, and **the only place money is formatted** (§7.12).

```tsx
<MoneyValue piastres={260_000} />                          // EGP 2,600
<MoneyValue piastres={visit.balance} tone="due" />         // owed
<MoneyValue piastres={14_260_000} compact variant="display" />  // EGP 142.6k
```

- Integer piastres in, whole EGP out. Piastres are never shown.
- `compact` is the `142.6k` form, and §7.12 scopes it to the money hero and the
  stat cards. It only engages at 10,000 EGP; below that the full number is
  shorter anyway.
- Numerals are always mono and always Latin, in both languages (§7.11) — DM Mono
  has no Arabic-Indic coverage and localized digits would break the tabular
  alignment the money screens rely on.
- Currency position follows the language, never the screen (§7.13): `EGP 2,600`
  in English, `2,600 ج.م` in Arabic. Pass `language` to force it; the default
  reads the layout direction, which is the seam the localization scaffold (F4)
  will take over.

- `weight` is for the places the design sets one — a bold outstanding, a medium
  figure in a list — and is the only typographic prop; everything else about the
  face is the component's.
- `showCurrency={false}` drops `EGP` for a column that has already said it holds
  money. The history's amounts run down one edge and the three letters on every
  row are noise. A number alone in running text always keeps it.

For the places a component cannot go — a WhatsApp reminder template, a toast, an
accessibility label — `formatMoney(piastres)` and `formatAmount(piastres)` are
exported from the same file. Those are the whole list. **No screen formats an
amount itself**: no `/ 100`, no `toLocaleString`, no `EGP` string literal.

The arithmetic behind both lives in [`money.ts`](./money.ts), which imports no
`react-native` — see the bottom of this file.

## `TimeValue` and `clock.ts`

Every clock time in the app, and **the only place a time is formatted**. All
times are 12-hour with a meridiem; there is no 24-hour display anywhere.

```tsx
<TimeValue minutes={14 * 60 + 15} />                       // 2:15 PM
<TimeValue minutes={booked} variant="headline" tone="inverse" />
```

- Digits are Latin in both languages (§7.11), same reason as money: DM Mono has
  no Arabic-Indic coverage and the day view's columns are tabular.
- The meridiem does localize — `ص`/`م` in Arabic, which is what an Egyptian
  reader expects. It is a second `Text` so it can carry the Naskh face without
  dragging the digits off the mono one, exactly as `MoneyValue` handles `ج.م`.
- `minutes` is minutes from midnight. An ISO string goes through `minutesOfDay`.

The strings live in `clock.ts`, which imports no `react-native` on purpose — it
is the one piece of this directory that `bun test` can reach, and the day
cluster's `time.ts` and `chair.ts` re-export from it without pulling Metro into
a test run. `clock12` and `time12` return the figure and the meridiem
separately, for callers that set them at different sizes; `formatClock12`,
`formatTime12`, `formatStamp` and `formatSpan` are the one-string forms for a
label, a toast or an accessibility string. Those are the whole list. **No screen
formats a time itself**: no `padStart`, no `:` template, no `HH:MM`.

24-hour `HH:MM` strings are transport only — what the server sends, parsed by
the day cluster's `clockToMinutes`, and what `settings`' `timeFromMinutes`
writes back. They never reach a screen. The app has no 24-hour formatter at all
any more; `@lustre/shared/dates` briefly carried a second `clock12` and no
longer does.

## `PatientRow`

One patient in a list — patients, search results, debtors.

```tsx
<PatientRow patient={patient} onPress={() => open(patient.id)} />
<PatientRow patient={debtor} balance={debtor.balance} onPress={…} />
```

The `patient` prop is the server's shape (`patient.search`'s element type) with
`age` and `gender` optional, so a balance row — which knows only a name and a
phone — passes the same object through without a mapping layer.

`balance` is piastres and renders bare in `due` with a dot — a flag that
something is owed, not a statement of the balance, which is read in full on the
record under a heading that says it is money. It is not a failure state either:
partial payment is normal (PRD), and nothing here presents it as an error.

The row is full-bleed on the page ground with a hairline above every row, not a
card. `patients-list.html` runs the register edge to edge, and a white rounded
block per row stripes the list and turns each patient into an object of their
own.

## `StatusPill`

Where an appointment is, per §7's six statuses.

```tsx
<StatusPill status={appointment.status} />
<StatusPill status={appointment.status} withDot />     // a sheet headline
<StatusPill status="checked_in" animated={false} />    // long lists
```

`withDot` is opt-in because a dot is for a pill being read on its own. In a list
every row would carry one and the column stops meaning anything. `checked_in`
pulses when it has a dot — it is the in-the-chair state the day view reads from
across a desk. `awaiting_payment` is the patient at the desk, not an unpaid
status; balance is derived and shown separately (§10).

The wording is the mockups': "In the chair", "At the desk", "No-show". Labels are
English until F4 lands, and `label` is the override that scaffold will use.
`statusLabel` and `statusTone` are the same mapping without the markup, for an
accessibility string or a row that only has room for a word.

## `ToothGroupCard`

One tooth and the work planned on it. The same badge / position / lines block was
written three times — the doctor's visit sheet, the booking screen and the
procedure plan. The grouping was already shared (`toothGroupsOf`, wrapped by
`groupByTooth` to add subtotals); only the markup was not.

```tsx
<ToothGroupCard tooth={group.tooth} position={toothPosition(group.tooth)} lines={lines} />
<ToothGroupCard … variant="row" />                       // flush, inside a shared card
<ToothGroupCard … subtotal={<MoneyValue piastres={group.subtotal} />} onToggle={…} expanded={open} />
```

Its three callers are the doctor's visit sheet (`row`), the booking screen
(`card`, read-only) and the procedure plan (`card`, toggling, with a price input
per line and its own "Add to UL6" footer). Giving `onToggle` draws the head's
chevron; a card that opens says so itself rather than each caller drawing one.

- `variant` is the two arrangements the screens actually draw. `card` is a
  bordered box per tooth with a head row — a plan being built, where each tooth
  is a thing to open, price and add to. `row` is flush, badge on the start edge,
  lines and position stacked beside it, for a read where the teeth share one
  card: a booking is usually a single line, and a bordered box with a head row, a
  divider and one name in it is mostly chrome.
- **No money is formatted here.** `money` (per line) and `subtotal` (per group)
  are slots — a `MoneyValue`, a price input, or nothing at all, which is what a
  booking has: it carries the plan that was agreed, not a bill (§7).
- `position` is passed in, not derived. The caller already has it from
  `toothPosition`, and deriving it again would put the quadrant words in two
  places — which is the duplication this component ends, not one to move.

## `patientDraft`

Not a component: the field-level rules for a patient somebody is typing —
`emailError`, `phoneError`, `birthDateIso`, `birthDateOf`, `GENDERS`, `orNull`.
Three clusters held their own copy, and the settings cluster had started
importing across into `patients/` to avoid a fourth, which is the coupling
SPEC §10 exists to prevent.

The age-to-birth-date conversion is why it was worth stopping at three. It is the
app's one lossy rule — the design asks for a whole-number age, `patients` stores
`birth_date`, and 34 is written as `1 January (this year − 34)` — and a fourth
copy would drift **silently**, because nothing reads a migrated patient's age
until months later.

What stays with each cluster is its submission shape, because `patient.create`,
`patient.update` and `migration.enter` take three different things. In
particular the guard stays with the patient editor: `birthDate` is only sent when
the age *string* on screen differs from the age the record arrived with, so a
patient booked in with a real date off an ID card is never flattened to 1 January
by an editor opened to fix their phone number. Covered in `patients.test.ts`.

**Imported by path, not through the barrel** — `components/domain/patientDraft`.
Every component in this directory imports `react-native`, which fails outside
Metro, and these rules are covered by `bun test` in three suites that have no
renderer and need none. A barrel re-export would drag React Native into all of
them.

Date arithmetic it needs — `todayKey`, `offsetForDate`, `daysInMonth` — is in
`@lustre/shared/dates`, which has no cluster in it either. `clock12` and
`formatClock12` went the same way, for the same reason: the day view and the
settings panes both put a time on screen.

## `money`

The money rules themselves, and the second thing here **imported by path** —
`components/domain/money`. Same reason as `patientDraft`: `MoneyValue.tsx`
imports `react-native`, and cluster suites format an amount under `bun test`
with no renderer.

```ts
import { formatAmount, poundsToPiastres, toPounds } from '../../components/domain/money';
```

`formatAmount`, `formatMoney`, `toPounds`, `sanitisePounds`, `poundsToPiastres`.
Rounding is applied to the magnitude, not the signed value — `Math.round` breaks
ties toward +∞, so `-950` piastres rounded signed lands on `-9` while `+950`
lands on `10`, the same half-pound reading differently either side of zero.

The one thing it cannot do is infer the language: that reads `I18nManager`, so
the direction-aware `formatMoney` is the one `MoneyValue.tsx` exports and the
barrel re-exports. This file's takes an explicit `language` and defaults to
English. **On screen, always use the barrel's.**

## No runtime tests for the components

There is no React Native test environment in the repo yet — `bun test` runs on
Bun, and importing anything from `react-native` fails outside Metro. That is why
`theme/tokens.test.ts` and `ui/boundaries.test.ts` are source scanners rather
than render tests. The *components* here are covered by the same two scanners (no
raw colours, no physical directions) and by nothing else. A render test needs a
test renderer first; it is worth doing before the money screens land.

`patientDraft` and `clock.ts` are the exceptions, both for the same reason: they
import no `react-native`, so `patientDraft.test.ts` and `clock.test.ts` run on
Bun like any other logic module. The three cluster suites cover their own
submission shapes on top of `patientDraft`; that file covers the rules
themselves at their edges. `clock.ts`'s renderer, `TimeValue`, is in the same
position as every other component here — unverified until there is a device or
a test renderer.
