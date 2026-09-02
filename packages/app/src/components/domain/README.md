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

Four components are here because more than one screen cluster needs them.
Everything else in §5 belongs to whichever screen builds it first.

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

`minutesToClock`-style 24-hour strings are transport only — what the server
sends and what `settings`' `timeFromMinutes` writes back. They never reach a
screen.

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

## Almost no runtime tests here

There is no React Native test environment in the repo yet — `bun test` runs on
Bun, and importing anything from `react-native` fails outside Metro. That is why
`theme/tokens.test.ts` and `ui/boundaries.test.ts` are source scanners rather
than render tests. These components are covered by the same two scanners (no raw
colours, no physical directions) and by nothing else. A render test needs a test
renderer first; it is worth doing before the money screens land.

`clock.ts` is the exception, and only because it holds no JSX and imports no
`react-native`: `clock.test.ts` covers it directly. Its renderer, `TimeValue`,
is in the same position as everything else here — unverified until there is a
device or a test renderer.
