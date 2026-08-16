# Product

<!-- impeccable:product-schema 1 -->

Product truth for Lustre. Repo-wide: `packages/app` inherits this file. The
narrative source is the PRD and the technical contract is the spec, both on
[Notion](https://app.notion.com/p/3b7541c6b44181d8a6aee73ec9b34dcc). This file
records the durable facts design work must not re-derive or contradict.

## Platform

android

Both users are on Android phones. There is no desktop or web client, and no
tablet in v1 — the v2 patient-intake tablet is a locked-down mode of the same
app, not a second design language.

## Stack

React Native (Expo 57, RN 0.86) is already scaffolded. Navigation and styling
were **delegated**: Expo Router for file-based navigation, plus a hand-rolled
theme/token module over `StyleSheet` — no UI kit.

Reasoning, so later work knows this was a decision and not a default:

- **Expo Router** matches the OTA update model in PRD §6 (routes ship as JS, no
  reinstall) and keeps deep links available for the WhatsApp round trip.
- **No UI kit** (Paper, Tamagui, NativeWind). SPEC §14 requires the layout to
  mirror under Arabic RTL, and a kit's opinions become the product's look. RN's
  own logical properties (`marginStart`, `paddingEnd`, `textAlign: 'start'`)
  mirror correctly without a styling layer to fight, and a clinic app with two
  users needs a small, legible surface more than it needs component breadth.
- Motion, when it arrives, uses `react-native-reanimated` (already an Expo peer).

Revisit only with a stated reason; do not silently introduce a UI kit.

## Users

**The secretary** — primary user, on her phone, standing at a desk. Her day has
two distinct modes, and this is the single most design-relevant fact in the
product:

- **Patient at the desk:** booking, check-in, payment. These must beat writing
  in the paper book. If they don't, she stops using the app for them.
- **Patient with the doctor:** an idle window. Entering patient details, custom
  questions, corrections, and reminders live here and may be thorough and slow.

**The doctor** — checks his schedule between patients, reviews patient history
and takings, and owns settings (prices, procedures, branches, custom questions,
durations, payment methods, reminder timing and wording, clinic details). Also
on a phone.

Two users total, one practitioner, two branches. `CLIENT_ROLES`
(`secretary` | `doctor`) is a client-side preference, not a permission boundary.

## Product Purpose

Replace a paper appointment book and an unmonitored WhatsApp number for a
dental practice, without enlarging the workflow. It exists to stop three
failures: missed appointment requests, patients forgetting appointments, and
records that cannot be searched.

Success (PRD §7): the secretary is still using it after 30 days; no
double-bookings; reminders sent consistently; the doctor sees monthly takings
without reading the paper book; missed appointments surface on a screen instead
of being noticed late.

## Positioning

Not a clinic platform — the same workflow with fewer things missed. Three
commitments a neighboring product would not truthfully make:

- **No cloud.** The server and database run on a PC at the clinic, reachable
  only over Tailscale. No third party holds patient data.
- **No automated messaging.** The app never sends. It prompts; the user sends
  from her own WhatsApp. The clinic's number is never at risk of restriction.
- **One-time fee, no subscription.** All clinic-specific values are data, so
  another clinic runs the same build.

## Operating Context

- **Physical scene:** a reception desk, a phone in one hand, a patient waiting.
  Interruption is the normal case, not the exception.
- **Core flow (PRD §4):** patient arrives → check in → confirm procedures and
  details → finance page, amount due → book next appointment → check out, patient
  pays on the way out.
- **Paper coexists.** The doctor writes on paper during the visit; the secretary
  enters it afterwards during the idle window. The app is deliberately behind on
  procedure detail, and this must not block taking payment. The clinic must be
  able to run a full day on paper if the system is down.
- **WhatsApp is a destination.** One tap leaves the app into a specific patient's
  chat with a message pre-filled, and the user returns. Design for the round trip.
- **Offline is expected**, not exceptional: on power cut or reboot the app shows
  today's and tomorrow's schedule from cache, read-only, with a notice. It must
  never report a booking as saved when it was not.
- **Reminders** are a daily notification (19:00 default) that **repeats until the
  list is cleared or dismissed**, and stops overnight.

## Capabilities and Constraints

Confirmed functionality: appointments (day view, one branch one day, tappable
gaps), booking with explicit secretary-chosen duration, walk-ins as a single
book-and-check-in, check-in/checkout with payment, per-patient running balances
across visits, a balances screen (total outstanding, who owes and for how long,
charged vs collected for a period), a configurable procedure catalogue with
categories, subtypes and per-unit quantities, patients with doctor-defined custom
questions and full visit history, missed-appointment resolution, and settings.

Hard constraints:

- **Overlap is impossible by construction** — enforced by a Postgres `EXCLUDE
  USING gist` constraint, not application code. Only `booked` and `checked_in`
  hold a slot.
- **Money is integer piastres** (100 = 1 EGP), never floats. Formatting happens
  at the display layer only. A single amount is capped at 100,000,000 piastres.
- **Prices are recorded as of the visit date.** Editing a price never rewrites
  history.
- **One automatic rule only:** if any procedure was performed, the checkup fee is
  removed. Everything else — totals, amounts paid — is manual and editable.
- **Nothing happens on a timer.** No auto no-show, no auto status change. The
  user resolves missed appointments manually.
- **Partial payment is normal, not an error.** Nothing may present a balance as
  a failure state.
- **No logins.** Reachability on the tailnet is the entire authorization model.
- **Never display or log patient data outside its screen** — no names, phones,
  notes, or amounts in logs or alerts. IDs and error codes only.
- **The client localizes from `ERROR_CODE`**, never by parsing server message
  text.

Terminology (`packages/shared/src/enums.ts` is the source of truth): appointment
statuses `booked`, `checked_in`, `done`, `cancelled`, `no_show`; channels `desk`,
`walk_in`; payment methods `cash`, `visa`, `instapay`, `other` (`other` requires
a note); question kinds `text`, `number`, `boolean`, `select`; reminder statuses
`pending`, `sent`, `skipped`. Appointment `ref` is `DDMMYY-XXXX`, day first, from
an alphabet with no `0/O` or `1/I/L` so it is unambiguous read aloud.

Explicitly not built (PRD §5): patient self-booking, any automated messaging,
printing, web or desktop access, multi-practitioner scheduling, clinical records
/ prescriptions / imaging, insurance, logins and permissions.

Undecided: **whether a second practitioner joins** (PRD §10) — determines whether
appointments may overlap across branches. Do not design as if the answer is known.

Planned for v2, not v1: patient intake on a locked-down tablet, reviewed by the
secretary before becoming a record.

## Brand Commitments

Name: **Lustre Clinic**. Package `com.lustre.clinic`.

The assets in `packages/app/assets/` and the `#E6F4FE` adaptive-icon background
are **placeholders, explicitly not binding**. A later visual world may replace
the icon and color entirely.

No confirmed voice, logo, or identity constraint exists yet. Do not treat the
scaffold's light-only `userInterfaceStyle` as a brand decision.

## Evidence on Hand

- **PRD** (Notion) — client-confirmed problem, users, constraints, scope, rollout.
- **Technical Spec** (Notion) — the technical contract, section-numbered and cited
  throughout the code.
- `packages/shared/src/enums.ts`, `constants.ts` — the real domain vocabulary.
- `packages/server/src/db/schema.ts` and migrations — the real data model.

There are **no** users, testimonials, screenshots, metrics, case studies, or
production data. One clinic, not yet delivered. Nothing may claim otherwise.

## Product Principles

1. **The two modes decide placement.** Desk-side flows (book, check in, take
   payment) are short and interruption-proof. Idle-window flows (records, custom
   questions, reminders) may be long and thorough. Putting a slow step at the
   desk is the one failure that ends adoption.
2. **Faster than the paper book, or it loses.** The benchmark is not another app.
   Every desk-side flow is measured against a pen.
3. **The app never acts on the user's behalf.** It does not send, does not
   auto-status, does not guess a duration or a price. It removes the need to
   remember, then gets out of the way.
4. **Truth over optimism.** Never show a booking as saved when it wasn't, a
   balance as settled when it isn't, or cached data as live. Degraded states are
   labeled, not hidden.
5. **Everything the clinic can change is data.** Prices, procedures, branches,
   questions, durations, reminder wording. No routine change needs a developer,
   and no design may hard-code what settings own.

## Accessibility & Inclusion

- **English is primary; Arabic is fully supported.** Text direction derives from
  the locale and **the layout must mirror** (SPEC §14, §3.2). Every screen is
  checked in RTL. Numerals, dates, currency, and the `DDMMYY-XXXX` ref must stay
  legible in both.
- The real usage scene is one-handed, on a phone, standing, often mid-conversation
  — touch targets and text sizes are sized for that, not for a calm reader.
- No further product-specific standard has been established by the client.
