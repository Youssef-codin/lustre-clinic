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

## Crossing clusters is the shell's job, and it moves requests, not routes

Each cluster owns its own stack, so none of them can push a screen into another
one — which is why the patient record drew Book, Walk-in and Record payment and
let all three toast. The fix is in `shell/routes.ts`: the ask goes up to
`AppShell` and back down as a *request* carrying what the destination needs plus
a `seq`, and the destination cluster decides which of its screens that means.
`seq` is what makes one ask distinguishable from the last, so the same patient
can be booked twice; a cluster reads it during render, not in an effect, so the
screen is up in the same commit as the tab switch.

Going home — tapping the tab you are already on — runs the same wire backwards
and for the same reason. The shell cannot pop a route it does not own, so it
bumps a counter per tab and each cluster resets itself, deciding for itself what
home is. The Patients tab also scrolls its list to the top, because home there
is the search field and the register is longer than a screen; the other three
only pop.

A real navigator (SPEC §18 F3) gives both of these for free and both are written
to be deleted when one lands: every request is already the shape of a route's
params, and `goHome` is `popToTop`.

## Record payment opens the balances, not a payment form

The record's outstanding strip knows a patient-level total that can span several
unsettled visits, and `visit.recordPayment` takes one `visitId`. Rather than
spread a payment across the oldest debts — a second, invisible rule about money
— the button lands on that patient's balances in the money cluster, which is the
list the total is made of, and the visit is chosen there. That is what the Money
tab already does from its own debtor rows; the record joins it instead of
growing a second way to take a payment.

## Book and Walk-in are one screen with two openings

`BookingScreen` already made the walk-in the "now" answer to *when*, so the
record's two buttons are not two flows: both push that screen for the patient
they are on, and differ only in the answer it opens on. What they skip is
`BookPatientSheet`, whose only question — who is this for — the record has
already answered.

They are passed only on the secretary's phone. The doctor's day view has no
booking on it to reach, so on his the record keeps the screen's own fallback,
which names where the flow lives rather than failing silently.

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

## Data entry runs on the real client while its cluster runs on fixtures

Odd on sight, deliberate. Every other settings pane calls `data/_LocalApi`; the
data entry pane calls `../../../api` directly. It has to — it writes real
patients into the real register, and a morning of typing into a store that does
not survive a reload is a morning thrown away.

It also carries its own `errorText` rather than using `data/hooks`'
`errorMessage`, which would flatten a real offline failure into "Something went
wrong" — the one thing it must not say during a migration session, since the
desk needs to know the row is still on screen.

Both halves go away when `_LocalApi` is retired.

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
- **Working hours is a row in the CLINIC group** though `settings.html`'s index
  (GENERAL / CLINIC / ABOUT) has no slot for it. The alternative was deleting a
  working screen over an omission in a design file that never mentions opening
  hours at all. `glyph="hours"` is the one icon without mockup path data behind
  it. Delete the row and the import if the omission was intentional.

## Bilingual labels: one rule, taking the locale as an argument

`custom_questions.label_ar` (`0003_custom_question_arabic_label.sql`), nullable
and unbackfilled. Which of the two labels shows is `resolveLabel` in
`@lustre/shared` — one rule, **taking the locale as an argument rather than
reading it**, because the patient tablet will ask the patient and pass a
different one against the same rows.

Still single-column: `procedure_types.name`, `branches.name`,
`settings.clinic_name`. `settings-procedures.html` draws the pair for procedures
and categories, so that pane is the next to want it. Same migration shape, and
the rule is already written.

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

## There is no time field in `ui/`

Working hours uses a `ui/Select` of half-hour slots from 07:00 to 22:00. Plain,
obvious, and it cannot produce a value the server would reject. A real
`ui/TimeField` — or a platform picker — would be better if a clinic ever opens
at 09:45.

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
