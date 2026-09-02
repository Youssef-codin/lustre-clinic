# DECISIONS

Why the code is the way it is.

**Open work is not here.** It lives in the Notion Tasks database. This file was
once a blocker log (`BLOCKED.md`, 10–23 Aug 2026); everything in it that was a
thing still to do became a task on 24 Aug and was removed. What is left is the
reasoning — the choices that are lossy, that depart from a design, that break a
rule on purpose, or that were made once and should not be re-litigated from
scratch by whoever reads the code next.

Two entries are kept as **corrections**: they were written, they were wrong, and
deleting them would let the same mistake happen again.

---

# Data model

## An age is stored as 1 January

`patient-edit.html`'s basics row is `Age · sex` and holds a whole number.
`patients` has no age column: `birth_date` is the fact and `age` is derived from
it at read time (`ageFromBirthDate`), deliberately, because a stored age is
wrong within a year of storing it.

**Decided:** the row is drawn exactly as designed, and an age of 34 is written
as `1 January (this year − 34)`. That reads back as 34 all year and as 35 next
year — the patient ages, which is the point. What is lost is the day they age
*on*, which is what a clinic that only ever asked "how old are you?" never knew
either.

The lossy half is guarded rather than accepted: `birthDate` is only sent when
the age **string** on screen differs from the age the record arrived with. A
patient booked in through the day cluster — `patientDraft.ts` asks for the real
date off an ID card — therefore never has it flattened to 1 January by an editor
that was opened to fix their phone number. Covered in `patients.test.ts`.

**If this is wrong**, the fix is a designed date-of-birth row, not a code
change: `day/patientDraft.ts` already has the digits-only `DD / MM / YYYY` field
and its validation.

## `is_opening_balance` is on `appointments`, not on `visits`

The task specified `visits`. It went on `appointments` instead, because every
reader that has to tell a carried-over balance apart from a real one already
joins `appointments` and one of them can only reach it there: `stats.summary`'s
appointment counts are `FROM appointments` with no visit join, and
`appointment.byDate` — the day view — has no visits in it at all. On `visits`
the cutoff date would still have drawn four hundred `done` appointments nobody
attended.

## `patient.byId` returns `history`, not `visits`

The design's history row leads with the procedure and says whether the patient
came. A visits-only query could say neither, and a no-show — which never
produces a visit — was missing from the record entirely.

`patientService.byId` returns `history`, driven from `appointments` with the
visit left-joined:

- `status` — the appointment's, so `Came` / `No-show` / `Cancelled` is sayable.
- `procedures` — from `visit_procedures` when the patient reached the chair
  (those carry the price actually billed), from `appointment_procedures` when
  they did not, which is the only record of what was going to be done. Both are
  one query for the whole history, not one per row.
- `visitId` is nullable; the money columns are `0` on a row that never became a
  visit, and the client draws no amount at all rather than `EGP 0`.

## `patient.recent` returns a payload, not a bare array

`patient.recent q ({ limit }) → { patients, total }`. The heading's count is the
whole register and the page is capped at the limit, so the two cannot be read
off one array — and a second procedure for one integer would be a wasted round
trip over Tailscale on a screen that draws them together.

Related: `patientService.search` answers `[]` for an empty term, deliberately.
Browsing is `recent`; searching is `search`.

## There are no users, and that is the design

There is no `users` table, no login, and no server-side notion of who is holding
a phone. SPEC §1: **reachability on the tailnet is the authorization model.**
What exists is the role (§6), local to the device and switchable by anyone
holding it.

Real accounts would be a schema change and a genuine permission boundary, not a
settings row. The reasoning lives in `components/RoleSwitchSheet.tsx`, which
replaced an entire Users pane with a confirm sheet on the settings index.

---

# Client architecture

## One branch or all of them — deliberately unsettled

The day view queries every branch (`appointment.byDate`'s `branchId` is optional
and is not passed) and the walk-in books into `branch.list`'s first row. With one
branch per clinic PC that is right, and a selector would be a control that never
changes anything; with two, the walk-in silently lands in the wrong one.

The spec settles the neighbouring question — "branch is not part of the
exclusion, one practitioner" (§5) — but never says whether a client sees one
branch or all of them. `settings.schedule` hints at one: each weekday row
carries a single `branchId`, so the clinic's own schedule assumes one branch is
open on a given day.

**If it is more than one**, this needs a branch in the app's *own* settings (the
device's branch, not the clinic's) rather than a picker on the walk-in sheet —
the secretary sits in one room and should not choose it per patient. That is the
app shell's, alongside the server address, and it is what the settings index's
identity card and the branch list's "YOU'RE HERE" tag are both already asking
for.

## Empty time on the day view is not tappable

Tapping an empty slot should open a booking sheet. It does not. Empty time is
drawn on the timeline — it is where there is room — but a walk-in starts at
`now` and cannot be given the four o'clock the tap meant, and the patient picker
a real booking needs belongs to the Patients cluster. Creation on this screen is
the FAB, which opens the walk-in sheet (§7).

## `packages/app/tsconfig.json` carries `allowImportingTsExtensions`

**A shared file edited from a screens cluster**, against §10, on purpose.

`@lustre/shared` is source, not a build artefact, and `index.ts` re-exports its
siblings with explicit `.ts` extensions. The app's tsconfig extends
`expo/tsconfig.base` rather than the repo's `tsconfig.base.json`, so it did not
carry the flag, and the **first** app file to import the contract fails to
typecheck. That is every cluster, not one of them. One line, identical in every
branch that would have hit it.

**Live cost, unfixed:** importing `@lustre/shared` pulls **zod** into the RN
bundle, because `enums.ts` builds its schemas at module scope. The app only
wants the tuples and the types. Worth a `shared/enums` entry point carrying no
zod, or accepting ~50KB.

## Clinic opening hours have one owner

`screens/day/hours.ts` is the single module that owns the day's bounds. It
prefers the server schedule (`settings.schedule`, `clinic_days`) and falls back
to hardcoded defaults when the clinic has never configured one, so an
unconfigured clinic does not render seven closed days.

## The settings cluster localizes failures in one place

`data/errors.ts` holds one sentence per `ERROR_CODE`, and a pane that can say
something better for a code passes it in. Data entry is the reason the override
exists: during a migration session, "something went wrong" is the one thing the
desk must not be told, because what it needs to know is that the row is still on
screen and nothing was lost.

This replaced two error mappers — the cluster's and the data entry pane's own —
which existed because that pane ran on the real client while everything around
it ran on `data/_LocalApi`. Both are gone with the stand-in.

---

# Setup and connectivity

## The setup screen was built without a design

The Open Design project has fourteen screens and none is setup; nothing in
`brand-product` covers a first-run flow either. Built from `theme/tokens.ts` and
`ui/` directly, on the owner's call. It borrows `OfflineScreen`'s shape — one
centred card on canvas, no tab bar, no header — because they are the same kind
of surface: the app before it has anything true to draw.

**If setup is ever drawn, the mockup arrives second.** Treat the built version
as a proposal, not as the thing the design has to match.

## Onboarding persists to AsyncStorage, as two keys

`@react-native-async-storage/async-storage`, behind `shell/serverStore.ts` — the
only file in the app that touches it. **Two string keys rather than one JSON
blob**, so a half-written value comes back as an address that fails to answer
instead of a parse that throws on the boot path. Hydration starts on the first
subscriber and `App` holds a blank frame until it resolves.

It is a native module: `bun emu:build` / `bun device:build` once. A JS-only
reload will not pick it up.

## `OfflineScreen` has a way out

A consequence of persisting the address. Before it, a wrong address died with
the process; now it is remembered, and a typo means every launch resolves it,
fails, and lands on a screen whose only control is Try again — which can never
fix it. Hence one `text` button, "Change server address", and a `reconfiguring`
flag. The stored values are left in place so setup opens on them and the address
is *edited*, not retyped.

## Setup is not on the front door

The clinic's server PC is on a static address outside the router's DHCP pool, so
the address is knowable at build time in a way §14 did not assume. `app.json`'s
`extra.server.lan` ships it, and `shell/serverStore.ts` probes it during the boot
hold: a phone at the clinic this build was made for goes straight to the shell
and never sees setup.

Setup is now for the clinic that moved its server, the second clinic running the
same build (PRODUCT.md's one-time-fee commitment survives, because a default is
a default and not a requirement), and the typo.

**The distinction that makes it safe.** "Never reached this clinic" and "cannot
reach it right now" are different states and get different screens. A stored
address is **never** re-probed against the default — a phone whose clinic is
merely switched off is offline, not unconfigured, and sending it back to a screen
demanding an address it already has right is how a secretary retypes a correct
answer and still fails. `stored` carries that distinction.

**Cost, in the dev loop:** the committed default is the clinic's address rather
than `localhost:3002`, so an emulator lands on setup on first run. Entered once,
then persisted — once per install.

## The tailnet address comes from the server

§14 has both addresses "configured during onboarding", which meant the MagicDNS
name was typed into every handset, and typed again on all of them the day the
clinic moved its server.

The clinic PC already knows where it is: `.env` carries `TAILSCALE_IP` because
compose binds the published port to it. `health.check` reports a `tailscale`
address resolved from `TAILSCALE_HOSTNAME`, or from `TAILSCALE_IP` when that is
a real tailnet address rather than the 0.0.0.0 dev default. The app reads it on
every successful connection and stores it, so the address is configured once on
the server and the handsets follow.

**This is a contract change against §14 and `api/README.md`** — which is why it
went as a PR against `main` and not as a screen-local decision. The setup screen
keeps the field as a manual fallback: a server that reports nothing must not
wipe an address that works, and an older build that does not send the field is
indistinguishable from one that has not been configured.

---

# Design fidelity

## Half-pixel type resolves to the ramp — one decision, app-wide

The mockups measure type in half pixels (26 / 15.5 / 14.5 / 13.5 / 12.5 / 11.5 /
10.5), and `theme/tokens.ts` deliberately snaps them to one ramp. Every screen
reads these files that way. The same goes for the 22px gutter (`size.gutter` is
20), the 42–48px controls (`size.control` is 48) and the 16–20px card radii
(`radius.xl2` is 18).

**Structure, weight, colour role, copy and spacing rhythm are the design's
exactly. The sizes are the ramp's nearest.**

The clearest cost, recorded so the argument has a number attached: on the patient
editor the question controls are 48px rather than the mockup's ~42, so six
questions are ~36px taller than drawn. The mockup already scrolls at six, so
nothing is cut off.

Revisit as one decision across the app, never per screen.

## The record bar draws a pencil, not the mockup's `⋯`

A deliberate departure from `patient-view.html`, at the dentist's word, and the
smaller lie of the two: `⋯` promises a menu, and tapping it to land straight in
an editor is a promise broken every time. A pencil says the one thing the button
actually does.

It goes back to `⋯` — `ui/PopoverMenu`, `Edit` at the top — the day a second
action (merge, deactivate, export) gives the menu something to be.

## Other deltas taken deliberately

- **"YOU'RE HERE"** is drawn `tone="ink" variant="filled"` — the soft grey chip
  already used for REQUIRED — rather than the mockup's solid ink fill with white
  text. A fourth `Tag` variant for one tag on one screen is the per-screen
  override the ramp exists to prevent.
- **`isToothSpecific`** keeps its switch in the procedure editor. The mockup's
  properties card lists only quantity, checkup and active, but the flag is real,
  the row still shows a TOOTH tag, and the visit screen reads it.
- **Patient fields keeps deactivate over the mockup's delete**, and keeps the
  answer type locked once a question exists. The delete that orphans answers was
  removed on purpose; the mockup's "answers are kept but hidden" sheet describes
  deactivation in delete's words.
- **The branch card drops its second line.** The design gives each branch a
  phone number, a patient count, the year it opened and the month it closed, and
  tags the one the phone is standing in. `branches` is `id, name, address,
  active`, and nothing tracks which branch a phone is in. Every one of those
  would have been a number the pane made up, which is the bug the cluster was
  just taken off fixtures to fix. The identity card names the clinic for the
  same reason. They come back when the columns do — see the tasks split out of
  *Ten Settings panes run on fixtures*.
- **Working hours is a row in the CLINIC group** though `settings.html`'s index
  (GENERAL / CLINIC / ABOUT) has no slot for it. The alternative was deleting a
  working screen over an omission in a design file that never mentions opening
  hours at all. `glyph="hours"` is the one icon without mockup path data behind
  it. Delete the row and the import if the omission was intentional.

## Making a category writes two rows, or none

`settings-procedures.html`'s ghost "Category" button opens a sheet that names a
category and adds it to the tree on its own. It cannot work that way here: a row
is a category because something else names it as a parent, so a category with
nothing under it is just a root with a price — and `procedure.list` would offer
it on a visit.

So the sheet names the category and the editor behind it asks for the first
subtype. Both rows are written by one call — `procedure.createCategory`, in one
transaction — when that editor saves; backing out writes nothing. Two client
calls would have left a childless root priced 0 behind whenever the second
failed, which is the very thing this is avoiding. An empty category therefore cannot exist, which is this branch's answer
to the open question on the task ("what happens if you later file nothing under
it").

The alternative was a column — `is_category`, or a nullable price — which is a
migration on the shared database for a button, and forecloses nothing if it is
wanted later.

The other half of the same rule: a category whose only visible subtype is hidden
still draws, as a heading with its "Add to" button and nothing under it. It used
to vanish from the list while remaining unselectable, which left a row nothing
on this screen could reach.

## Bilingual labels: one rule, taking the locale as an argument

`custom_questions.label_ar` (`0003_custom_question_arabic_label.sql`), nullable
and unbackfilled. Which of the two labels shows is `resolveLabel` in
`@lustre/shared` — one rule, **taking the locale as an argument rather than
reading it**, because the patient tablet will ask the patient and pass a
different one against the same rows.

Still single-column: `procedure_types.name`, `branches.name`,
`settings.clinic_name`. `settings-procedures.html` draws the pair for procedures
and categories — the new category sheet asks in English only for exactly this
reason — so that pane is the next to want it. Same migration shape, and the rule
is already written.

**The answer is not bilingual and is not meant to become so:** it is stored once,
in whichever language it was given.

## Icons come from the library, not from the mockup

`settings.html` ships its own `IC` table of monoline glyphs, and
`screens/settings/components/icons.tsx` originally traced all of them, on the
reasoning that eight icons in one column had to look like one set. CLAUDE.MD
forecloses that reasoning in as many words — icons come from the library, "not
to match a mockup".

Converted 24 Aug (`b501b53`). Most were like-for-like. These changed what the
glyph depicts, not just how it is drawn:

| Row | Mockup drew | Now |
| --- | --- | --- |
| App | a window with a title bar | `AppWindow` |
| Clinic | a house with a cross | `Hospital` |
| Procedures & prices | a case with a lid | `Tags` |
| Patient fields | ruled lines with a `+` | `ListPlus` |
| Switch role | two arrows doubling back | `Repeat` |

WhatsApp is the documented carve-out and comes from `@expo/vector-icons`, as in
`screens/day/components/Reminders.tsx`. `domain/BrandMark.tsx` keeps
`react-native-svg` — that is brand artwork, not an icon.

Where the mockup has no glyph to substitute at all, the nearest library one
rather than a hand-drawn tenth path: `DataEntryIcon` is Lucide's
`ClipboardList`.

## `--older` earned a rule; `--discount` has not

`--older` was a design token with no rule saying when it applied — `success` at a
second value. The money dashboard is the rule: **money in against an earlier
visit.** It is `color.older` now, with one caller.

`--discount` is still out, for the original reason.

---

# Deliberately not shared

Three things that look like duplication and are not. Do not merge them.

- **`HistoryRow` is not `domain/VisitRow`.** It replaced `_LocalVisitRow` and
  knows about `AppointmentStatus`, so it is *further* from shared than what it
  replaced, not closer. If it is ever promoted the name is `domain/HistoryRow`.
- **The cutoff-date parse in `dataEntry/entryForm.ts`** looks like
  `day/patientDraft`'s `birthDateIso` and is a different rule: a date of birth is
  refused for being too early, a cutoff for being in the future.
- **`SexToggle` is not `ui/SegmentedControl`.** Two reasons, the second being the
  real one. *Look:* `SegmentedControl` is System A's pill — a white thumb on
  `surface2`, sized for the two panes of a screen — where the design's toggle is
  an `ink` fill with white type riding on the end of a line of type inside a
  card; a filled half here has to read as an answer, not as a tab. *States:* it
  takes `value: T` and always draws a thumb, so a patient nobody recorded a sex
  for would show `Female` selected. That null state is the difference between
  "not answered" and "answered with the first option", and is worth having on the
  shared control regardless.

---

# Live sharp edges

Known, guarded, not yet fixed. None of these is a task because none is
straightforwardly actionable — each needs a design decision first.

## A **required** `date` question makes intake impossible

`date` has no control, so the editor draws it read-only. `validateIntake`,
though, requires an answer to every *active required* question — not merely the
ones the client can draw. So a clinic that ticks "required" on a date question
can no longer register anybody: every Save comes back `A required question was
left blank.`, naming a field the desk can see and cannot fill.

**Handled, not fixed.** `unaskableRequired` spots it and the screen says so —
Save is refused with the question named and the way out (make it optional in
Settings) rather than a round trip that always fails. Editing is unaffected;
`validatePatch` judges only the keys it is sent.

**The real fix is the control** — `'date'` in `EDITABLE_KINDS` and a field
returned from its case in `AnswerEditor`. Until then nothing stops a dentist
ticking the box, so the editor has to survive it.

## `notes` is on the record and on no design

`patients.notes` exists, `create` and `update` both take it, and the day
cluster's booking flow writes it. Neither `patient-edit.html` nor
`patient-view.html` draws a field for it, so the editor does not send it — and,
because a patch leaves out what it is not given, a note written at booking
survives every save made there.

It is a `ui/Textarea` and ten minutes whenever the design says where it goes.

## The A–Z grouping is described, not drawn

`patients-list.html` ends with a line of prose: "A–Z groups continue below. In
Arabic the list sorts and mirrors right-to-left; chevrons point left." The
chevron half is built (`components/icons.tsx` swaps the glyph on
`I18nManager.isRTL`). The grouping is not designed anywhere — no band, no index
rail — and the server answers newest-first, so it was not invented.

Needs a designed screen showing what a group band looks like, and
`patient.recent` growing an `order`.

## Every time in the app is 12-hour, and the device does not get a vote

All clock times display as 12-hour with a meridiem. There is no 24-hour anywhere
in the UI. Formatting happens in one place — `domain/clock`, the way money
happens in `domain/MoneyValue` — because the per-screen alternative drifts back
the moment someone adds a screen, which is exactly how the day cluster and the
settings cluster ended up with two copies of the same eight lines.

24-hour `HH:MM` survives as *transport* and nothing else: it is what the server
sends and what `settings`' `timeFromMinutes` writes back. It never reaches a
screen. Storage is unchanged — `TIME` and `timestamptz` as before.

The meridiem localizes and the digits do not. `ص`/`م` in Arabic, because that is
what an Egyptian reader expects; Latin numerals in both languages per §7.11,
because DM Mono has no Arabic-Indic coverage and the day view's columns are
tabular. That split is why `clock12` hands back the figure and the marker
separately — the marker has to reach the Naskh face without taking the digits
with it, the same problem `ج.م` has in `MoneyValue`.

## The native time picker, forced to 12-hour

Working hours used a `ui/Select` of hardcoded half-hour slots in a full-height
sheet: no selected state, no confirm, and a clinic opening at 09:45 could not
say so. It is now the Android platform picker (`DateTimePickerAndroid`), which
opens on the current value, marks it, has OK and Cancel, sizes itself and counts
in minutes. Settings is the lowest-traffic screen in the app and these hours
change roughly never, which is the argument against hand-building a wheel for
it.

**The catch, and the resolution.** A native picker follows the *device's*
12/24-hour setting, which would have put a 24-hour clock inside the one control
that edits a time while every other surface showed 12-hour — the decision above
losing in the place it is most visible. Android takes an explicit
`is24Hour: false`, so the app's decision wins and the device's is ignored. That
override is what makes the native picker compatible with "no 24-hour anywhere"
rather than an exception to it, and it is not optional.

This does not generalise to iOS, whose spinner cannot be forced off the device
setting. The app has no iOS build — `scripts/` is adb and gradle throughout — so
the conflict is not live. If iOS is ever built, it has to be settled before the
picker is reused there.

**Still open:** the picker draws its *own* AM/PM from the OS locale, which the
app cannot override. On an English-locale device showing an Arabic layout, the
dialog says PM where the row behind it says م. Nothing to do about it short of
abandoning the native picker.

The `ui/TimeField` this entry used to ask for still does not exist. The control
lives in the settings cluster instead, because `ui/boundaries.test.ts` lets a
primitive import only react, react-native, the theme and its siblings, and the
picker is a native module outside that list. Promoting it means widening that
allowlist — a bigger call than one screen's picker, and one caller does not
justify it.

---

# Corrections

Kept because deleting them lets the same mistake happen again.

## The settings module was never bare — the stand-in was

**This was written as a blocker and was wrong.** It claimed the server stored
none of the clinic identity, duration or reminder settings. The server has had
all of it the whole time:

- `settings` — `clinic_name`, `clinic_phone`, `duration_options` (int array),
  `default_duration`, `reminder_lead_hours`, `reminder_notify_at`,
  `reminder_repeat_minutes`, `reminder_template`
- `settings.get` / `settings.update`, with `updateSettingsInput` validating every
  field

**The mistake:** the cluster's existing stand-in only mirrored
`settings.schedule` / `setDay` / `clearDay`, and that was taken as evidence the
rest of the module was equally bare — instead of reading `settings.router.ts`.

**The lesson generalises.** A stand-in's surface is evidence of what the *screen*
needed, never of what the *server* has. Read the router.

Genuinely absent, and still true: nothing raises the daily notification that
`reminder_notify_at` and `reminder_repeat_minutes` describe. The pane stores a
preference no scheduler reads.

## Working hours: the schema existed

Same shape of error, found earlier. A cluster brief said the `clinic_days` schema
did not exist and to stub it. It did — `db/schema.ts`, plus
`settings.schedule` / `setDay` / `clearDay` on the router. The screen was built
against the real shapes.
