# `domain/`

Components that know what a patient, an appointment and a balance are.
Component Inventory §2 and §5.

```tsx
import { MoneyValue, PatientRow, StatusPill } from '../components/domain';
```

`ui/` is the design system and knows nothing about Lustre; the moment a component
needs to know that an appointment has a status or that a balance is in piastres,
it lives here. `domain/` composes `ui/` and the theme, and may import
`@lustre/shared` and types inferred from `AppRouter`. The barrel is the only entry
point.

Three components are here because three of the four screen clusters need them.
Everything else in §5 belongs to whichever screen builds it first.

`patientDraft` is the one thing here that is not a component, and the one thing
imported by its own path rather than through the barrel. See the bottom of this
file.

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

For the places a component cannot go — a WhatsApp reminder template, a toast, an
accessibility label — `formatMoney(piastres)` and `formatAmount(piastres)` are
exported from the same file. Those are the whole list. **No screen formats an
amount itself**: no `/ 100`, no `toLocaleString`, no `EGP` string literal.

## `PatientRow`

One patient in a list — patients, search results, debtors.

```tsx
<PatientRow patient={patient} onPress={() => open(patient.id)} />
<PatientRow patient={debtor} balance={debtor.balance} onPress={…} />
```

The `patient` prop is the server's shape (`patient.search`'s element type) with
`age` and `gender` optional, so a balance row — which knows only a name and a
phone — passes the same object through without a mapping layer.

`balance` is piastres and renders in `due` with a dot. It is not a failure
state: partial payment is normal (PRD), and nothing here presents it as an error.

## `StatusPill`

Where an appointment is, per §7's six statuses.

```tsx
<StatusPill status={appointment.status} />
<StatusPill status="checked_in" animated={false} />   // long lists
```

`checked_in` pulses — it is the in-the-chair state the day view reads from
across a desk. `awaiting_payment` is the patient at the desk, not an unpaid
status; balance is derived and shown separately (§10). Labels are English until
F4 lands, and `label` is the override that scaffold will use.

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
`@lustre/shared/dates`, which has no cluster in it either.

## No runtime tests here

There is no React Native test environment in the repo yet — `bun test` runs on
Bun, and importing anything from `react-native` fails outside Metro. That is why
`theme/tokens.test.ts` and `ui/boundaries.test.ts` are source scanners rather
than render tests. These components are covered by the same two scanners (no raw
colours, no physical directions) and by nothing else. A render test needs a test
renderer first; it is worth doing before the money screens land.
