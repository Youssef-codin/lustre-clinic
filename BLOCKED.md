# BLOCKED

Component Inventory §10. One entry per thing a cluster needed and did not find.
Each is either promoted into `ui/`, `domain/` or the app shell before the merges,
or resolved as genuinely cluster-local and left alone.

Format: what was needed · who needed it · the shape expected · what was built
instead.

---

## tRPC client and TanStack Query — Day view

**Needed.** §10 lists "the tRPC client and the connection hook" as frozen shared
code to import. Neither exists: `packages/app` has no `@trpc/client`, no
`@tanstack/react-query`, and no `src/api`. Phase 1 F2 has not landed.

**Expected shape.** A `trpc` proxy client typed from `AppRouter`, plus the
TanStack Query bindings, so a screen writes
`trpc.appointment.byDate.useQuery({ date, offsetMinutes })`.

**Built instead.** `src/screens/day/data/`:

- `client.ts` — `_LocalTrpcClient`. Speaks the tRPC HTTP wire format over
  `fetch` (`GET /trpc/<path>?input=`, `POST /trpc/<path>`), unwraps
  `result.data`, and lifts `error.data.appCode` into a typed `RequestError`.
  No dependency added: adding one to `packages/app/package.json` would conflict
  in four branches at once, and the wire format is forty lines.
- `hooks.ts` — `useLocalQuery` / `useLocalMutation`. Loading, error, refetch and
  pending states only; no cache, no dedupe, no background refetch.
- `fixtures.ts` — an in-memory transport used when no server address is
  configured, because the onboarding that configures one (F1) has not landed
  either. It enforces the overlap constraint so the slot-taken path is
  reachable off a real Postgres.

**On promotion.** Every screen imports from `data/index.ts`. Swapping in the
real client is that file plus the six call sites in `data/day.ts`.

## `visit.byAppointment` — Day view

**Needed.** From a day-view row the client holds an `appointmentId` and needs the
visit to check the patient out. `appointments` carries no `visit_id`, and
`visitService.byAppointment` exists but is not exposed on `visit.router.ts`.

**Expected shape.** `visit.byAppointment q ({ appointmentId }) → Visit | null`.

**Built instead.** `data/day.ts` remembers the `visitId` returned by
`visit.checkIn` and `appointment.walkIn` for the session, and asks the server
only when it does not know. A patient checked in before the app was opened
therefore cannot be checked out from the day view yet — the sheet says so rather
than showing a button that fails.

Only `NOT_FOUND` is read as "no such procedure"; an unreachable server or a 500
is raised, so a clinic PC that is down does not masquerade as a visit that
cannot be looked up.

**Note.** This is a server-side gap, not a design one. One procedure on an
existing service.

## `domain/StatusPill`, `domain/MoneyValue` — Day view

**Needed.** §10 freezes both as shared; `src/components/domain/` does not exist.

**Expected shape.** `<StatusPill status={AppointmentStatus} />` and
`<MoneyValue piastres={number} currencyPosition="lead" | "trail" />` — §7.12,
§7.13: format at the edge, in `MoneyValue` only.

**Built instead.** `screens/day/components/_LocalStatusPill.tsx` and
`_LocalMoneyValue.tsx`, both thin wrappers over `ui/Tag` and `theme/Text`.
Promote wholesale; nothing in them is day-view specific.

## Booking a scheduled appointment — Day view

**Needed.** Tapping an empty slot should open a booking sheet. §8 lists
"book / move / cancel an appointment" as still to design, and the patient picker
it needs belongs to the Patients cluster.

**Built instead.** Nothing. Empty time is drawn on the timeline — it is where
there is room — but it is not tappable, because a walk-in starts at `now` and
cannot be given the four o'clock the tap meant. Creation on this screen is the
FAB, which opens the walk-in sheet (§7). `appointment.cancel` and the `no_show`
form of `appointment.update` are wired; `appointment.create` is not called
anywhere yet, and neither is the move.

## Which branch — Day view

**Needed.** A decision, not a component. The day view queries every branch
(`appointment.byDate`'s `branchId` is optional and is not passed) and the
walk-in books into `branch.list`'s first row. With one branch per clinic PC that
is right and a selector would be a control that never changes anything; with
two, the walk-in silently lands in the wrong one.

**Not built, deliberately.** The spec settles the neighbouring question — "branch
is not part of the exclusion, one practitioner" (§5) — but never says whether a
client sees one branch or all of them. `settings.schedule` hints at one: each
weekday row carries a single `branchId`, so the clinic's own schedule assumes
one branch is open on a given day.

**If it is more than one**, this needs a branch in the app's own settings (the
device's branch, not the clinic's) rather than a picker on the walk-in sheet —
the secretary sits in one room and should not choose it per patient. That is the
app shell's, alongside the server address.

## Clinic opening hours — Day view

**Not blocked, recorded for the merge.** MAW-1 landed `clinic_days` and
`settings.schedule` while this cluster was in flight. `screens/day/hours.ts` is
the single module that owns the bounds: it prefers the server schedule and falls
back to hardcoded defaults when the clinic has never configured one, so an
unconfigured clinic does not render seven closed days.

---

## Settings cluster — 10 Aug 2026

### 1. No tRPC client, no TanStack Query — `_LocalApi`

**Needed by:** every settings screen.
**Built:** `screens/settings/data/_LocalApi.ts`, `data/types.ts`, `data/hooks.ts`.

`packages/app` has no `@trpc/client`, no `@trpc/react-query`, no
`@tanstack/react-query` and no `AppRouter` import — F2 in SPEC §18 has not
landed, and §10 forbids a screen agent inventing the shared client. So the
cluster runs against an in-memory store with the same procedure names, inputs
and outputs as the routers it will call:

```
settings.schedule / setDay / clearDay      branch.list / create / update
procedure.tree / create / update           customQuestion.list / create / update
```

Everything is async with a ~420ms delay, and validation throws the real
`ERROR_CODE`s, so the pending and failure states on screen are the ones the
device will show.

**Prop shape expected of the real thing:** none. `data/types.ts` mirrors the
server service return types field for field — including `CustomQuestion.options`
being `unknown`, because the column is `jsonb` and that is what arrives; read it
through `optionsOf`, as the service does. Inputs take the routers' own shapes
(`list({ includeInactive })`, `clearDay({ weekday })`), not flags. So pointing
`api` at the tRPC client should not change a call site.

It is still a hand-written contract, which CLAUDE.MD forbids and which nothing
enforces: these types cannot drift *loudly*. The check is by eye until the
inferred `AppRouter` replaces them.

`data/hooks.ts` (`useQuery` / `useMutation`) is a stand-in for the TanStack
bindings with the same three states and no cache. A write reloads the query it
affected; `invalidateQueries` replaces that call for free.

### 2. `domain/MoneyValue` does not exist — `_LocalMoneyValue`

**Needed by:** procedure prices.
**Built:** `screens/settings/components/_LocalMoneyValue.tsx`.

§10 lists `domain/MoneyValue` as pre-built and frozen. `domain/` is not in the
tree at all. The local one implements §7.12 (integer piastres in, whole EGP out,
formatted only here) and §7.13 English order (`EGP 4,200`); the Arabic order
(`٢٬٦٠٠ ج.م`) is **not** implemented because there is no language switch yet.

**Prop shape expected:** `{ piastres: number; variant?: TextVariant; tone?:
TextTone; bare?: boolean }`. Money screens will want compact (`142.6k`) as well
— that is a prop the shared one needs and this one does not have.

Also exported here and needed by anything with a price input:
`poundsToPiastres(text)`, the other edge of the same rule.

### 3. No navigator — **resolved (F3)**

`src/shell/AppShell.tsx` now mounts the four clusters under
`domain/BottomTabBar`. Each cluster keeps its own internal stack; the panes
below were left on `PushView`, which is still the transition the designs draw.
Screens reserve `size.nav` at the bottom because the tab bar is drawn over them.

<details><summary>Original entry</summary>

### 3. No navigator (original)

**Needed by:** the settings index → its five panes.
**Built:** a route union inside `SettingsScreen`, one pane at a time in
`ui/PushView`.

F1/F3 have not landed and §10 forbids adding a navigator. `PushView` is the
transition the settings designs draw anyway, so this is not a workaround so much
as an early version of the real thing. Lifting the panes out is a change of
`setRoute` to `navigate`; each pane already takes an `onBack`.

</details>

### 4. Nothing mounts the settings screen — **resolved (F3)**

`App.tsx` mounts `<AppShell />`, which mounts every cluster including settings,
and hands `SettingsScreen` the shell-owned `role` / `onChangeRole`. Bundle
verified: `bunx expo export --platform android` is clean.

<details><summary>Original entry</summary>

### 4. Nothing mounts the settings screen (original)

`App.tsx` still mounts `GalleryScreen`. It was **deliberately not edited** —
four clusters editing the app entry point is a merge conflict in four branches,
which is the exact failure §10 exists to prevent. To see this cluster on a
device:

```diff
-import { GalleryScreen } from './src/screens/dev/GalleryScreen';
+import { SettingsScreen } from './src/screens/settings';
-            <GalleryScreen />
+            <SettingsScreen />
```

Verified with that swap applied locally: `bunx expo export --platform android`
bundles clean, 754 modules. Not yet seen on a physical device.

</details>

### 5. `packages/app/tsconfig.json` needed `allowImportingTsExtensions`

**Edited a shared file** — flagged here because §10 says not to.

`@lustre/shared` is source, not a build artefact, and `index.ts` re-exports its
siblings with explicit `.ts` extensions. The app's tsconfig extends
`expo/tsconfig.base` rather than the repo's `tsconfig.base.json`, so it did not
carry the flag, and the **first** app file to import the contract fails to
typecheck. That is every cluster, not just this one. One line, and the merge is
identical in all four branches.

Related, not fixed: importing `@lustre/shared` pulls **zod** into the RN bundle,
because `enums.ts` builds its schemas at module scope. The app only wants the
tuples and the types. Worth a `shared/enums` entry point that carries no zod, or
accepting ~50KB.

### 6. Working hours — the schema **does** exist

The brief for this cluster said the schema did not exist and to stub it. It
does: `clinic_days` is in `db/schema.ts` and `settings.schedule` / `setDay` /
`clearDay` are on the router (MAW-1). The screen is built against those real
shapes, so nothing here is a stub beyond entry 1.

### 7. No time field in `ui/`

**Needed by:** working hours (opens / closes).
**Built:** a `ui/Select` of half-hour slots from 07:00 to 22:00, in
`WorkingHoursScreen`.

Plain and obvious, and it cannot produce a value the server would reject. A real
`ui/TimeField` — or a platform time picker — would be better if a clinic ever
opens at 09:45. Not worth it for this cluster alone.

### 8. No list skeleton in `ui/`

**Needed by:** every list here.
**Built:** `screens/settings/components/QueryStates.tsx` — `SkeletonRows` and
`ErrorState`.

§7.14 asks for list loading skeletons and none were designed. The local one is
grey bars at row height with no shimmer. Every cluster needs this; it belongs in
`ui/` as `Skeleton` / `SkeletonRows`, and the error state belongs beside it —
the clinic server is a PC that is off during a power cut, so "could not load,
try again" is a normal state on every screen in the app.

**Prop shape expected:** `SkeletonRows { count?: number; trailing?: boolean }`,
`ErrorState { message: string; onRetry: () => void; retrying?: boolean }`.

### 9. No localisation dictionaries

**Built:** `errorMessage(error)` in `data/hooks.ts` — the `ERROR_CODE` switch,
in English.

F4 has not landed, so there is no dictionary and no `t()`. The switch on the
code is the part that matters and is already right (SPEC §4, §14: never parse a
server message); only the strings it returns move into the dictionary. Screen
copy is English literals for the same reason.

### 10. Cluster-local `domain/` components

`domain/` does not exist. These are settings-only per the Inventory §5 screen
column, so they were built under `screens/settings/` rather than invented as
shared. Promote if a second cluster wants one:

| Built | Inventory name |
| --- | --- |
| `components/SettingsRow.tsx` | `domain/SettingsRow` |
| `PatientFieldsScreen.tsx` → `FixedDetailsCard` | `domain/FixedDetailsCard` |
| `PatientFieldsScreen.tsx` → `FieldPreview` | `domain/FieldPreview` |
| `PatientFieldsScreen.tsx` → `QuestionRow` | `domain/PatientFieldRow` |
| `ProceduresScreen.tsx` → `ProcedureRow` | `domain/ProcedureListRow` |
| `UsersScreen.tsx` → the switch confirm | `domain/RoleSwitchSheet` |

### 11. Not built, and why

- **`domain/BottomTabBar`** — **now built** (F3), in
  `components/domain/BottomTabBar.tsx`, against the nav in
  `doctor-day-view.html`: Day / Patients / Money / the role. It sits in flow at
  the bottom of the shell and carries the bottom safe-area inset, so Android's
  gesture bar does not land on the labels.
- **`domain/BrandWordmark`** — also cross-cluster (day view). The settings header
  renders the Lustre mark rather than claiming the name.
- **`domain/ConnectionStatus`** — needs the connection hook, which §10 freezes
  and which does not exist. Building it would mean inventing the two-address
  probe from SPEC §14. The settings index has no connection row as a result.
- **`domain/BranchCard`'s "you are here" badge and stats** — there is no
  current-branch concept on the client and no per-branch stats endpoint.
- **Settings → App / Appointments / Reminders / Clinic** — designed
  (`settings.html` has seven sub-screens) and covered by `settings.update`, but
  outside this cluster's brief. Duration options, the reminder template, lead
  time and notify time all have router support and no screen.

### 12. Users are not a thing

**Built:** `UsersScreen` — one row saying what this device is set to, and a
confirm sheet for switching.

There is no `users` table, no login, and no server-side notion of who is holding
a phone. SPEC §1: reachability on the tailnet **is** the authorization model.
What exists is the role (§6), local to the device and switchable by anyone
holding it. The screen says that in as many words rather than drawing an account
system the clinic does not have.

The role itself is held in `SettingsScreen` state until the app shell owns it —
`SettingsScreen` takes optional `role` / `onChangeRole` props for exactly that
hand-over. Real accounts would be a schema change and a genuine permission
boundary, not a settings row.

### 13. Reorder is N writes

`procedure.update` and `customQuestion.update` take one `sortOrder` each; there
is no bulk reorder on either router. `_LocalApi.reorder(ids)` applies the whole
order in one call so the list does not reshuffle row by row in front of the
user. Against the real API that is N mutations, and a partial failure leaves the
order half-applied. Worth a `procedure.reorder` / `customQuestion.reorder`
mutation taking an ordered id list.

---

## Patient record — 16 Aug 2026

Built against `patient-view.html`, and wired to the real tRPC client: the
cluster's `_LocalPatientsApi` and its fixtures are deleted, and
`data/api.ts` calls `patient.byId` / `patient.search` / `patient.update` /
`customQuestion.list` / `balance.outstanding`. Entry 1 of the settings cluster's
list is resolved for this cluster.

### 1. `patient.byId` did not carry what the design draws — **fixed on the server**

The design's history row leads with the procedure and says whether the patient
came. `byId` returned neither: it was a visits-only query carrying `ref` and
totals, so the row could only show a reference number and settled/outstanding —
and a no-show, which never produces a visit, was missing from the record
entirely.

`patientService.byId` now returns `history` (was `visits`), driven from
`appointments` with the visit left-joined:

- `status` — the appointment's, so `Came` / `No-show` / `Cancelled` is sayable.
- `procedures` — from `visit_procedures` when the patient reached the chair
  (those carry the price actually billed), from `appointment_procedures` when
  they did not, which is the only record of what was going to be done. Both are
  one query for the whole history, not one per row.
- `visitId` is nullable; the money columns are `0` on a row that never became a
  visit, and the client draws no amount at all rather than `EGP 0`.

One consumer, so the rename is contained. Covered in `modules.test.ts`.

### 2. `Book appointment` / `Walk-in today` — not built

The design puts both under the identity block. Booking is `BookingScreen` and
the walk-in is the day view's FAB sheet, both in the day cluster, and there is
no navigator — `PatientsCluster` is a two-route union and cannot reach another
tab's stack. Drawing the buttons dead would be worse than leaving them out.

**Expected shape when a navigator lands:** `PatientRecordScreen` takes
`onBook?: () => void` / `onWalkIn?: () => void` the same way it already takes
`onRecordPayment`, and the cluster above it routes.

### 3. `Record payment` — prop exists, nothing passes it

`onRecordPayment` is on `PatientRecordScreenProps`. Settling a balance is
`RecordPaymentSheet` in the money cluster; same navigator problem as entry 2.
The button is drawn either way — the design's strip is three parts and a
missing third reads as a bug — and without a handler it says where payments are
taken, like the two openers.

### 4. No "recent patients" procedure — the list was search-only — **fixed on the server**

`_LocalPatientsApi.search('')` returned the most recently registered patients, so
the Patients tab opened on a browsable list. `patientService.search` answers `[]`
for an empty term, deliberately, so against the real server the tab opened on its
empty state until something was typed — where the design draws a list under
RECENT and the size of the register beside the heading.

`patient.recent q ({ limit }) → { patients, total }` now answers both. It returns
the payload rather than the bare `Patient[]` this entry first asked for: the
heading's count is the whole register and the page is capped at the limit, so the
two cannot be read off one array, and a second procedure for one integer would be
a wasted round trip over Tailscale on a screen that draws them together. Covered
in `modules.test.ts`.

### 5. `domain/VisitRow` — replaced, not promoted

`components/_LocalVisitRow.tsx` is deleted. `components/HistoryRow.tsx` takes its
place and knows about `AppointmentStatus`, so it is further from shared than the
old one was, not closer. The Inventory name should be `domain/HistoryRow` if it
is ever promoted.

### 6. The record bar's `⋯` — drawn, with nothing behind it

`patient-view.html` puts a trailing round "More" button opposite the back
button. Everything a menu behind it would hold is either elsewhere already
(editing answers is the Details tab's own button) or unbuilt (merge, deactivate,
export), so it toasts rather than opening an empty sheet.

**Expected shape:** an `onMore?: () => void` prop taking over from the toast —
the same rule the openers and the payment button follow.

### 7. The tooth group is drawn twice

`day/components/DoctorVisitSheet.tsx` renders the tooth badge / position /
lines block from `appointment-view.html`, and `BookingScreen` and
`ProcedurePlan` render the same block with a price column. Three copies of the
same 40 lines of style. The grouping itself is shared — `toothGroupsOf` in
`day/procedures.ts`, which `groupByTooth` now wraps to add subtotals — but the
markup is not.

**Expected shape:** `domain/ToothGroupCard`, taking the group and an optional
money slot per line, once `components/domain/` exists (§10).

---

## Patients list — 17 Aug 2026

Built against `patients-list.html`. Entry 4 above is resolved on the server; the
list now opens on `patient.recent` and switches to `patient.search` once
something is typed.

### 1. `New patient` — drawn, with nothing behind it — **resolved**

`PatientsCluster` routes it to `PatientEditScreen`, built from
`patient-edit.html`. The toast survives only as the fallback when the screen is
mounted without an `onNewPatient` — a gallery or a test — which is the rule the
record's openers already follow.

<details><summary>Original entry</summary>

The design puts a filled `New patient` pill opposite the heading, and it is the
one solid action on the screen. There is no patient-create flow to open: a record
is created as part of a booking (`day/components/PatientPicker`, whose own copy
says so out loud), `patient-edit.html` is designed but not built, and there is no
navigator to reach the day cluster from here.

So it toasts — the same rule the record's openers, its payment button and its `⋯`
already follow, and the same reason: the pill is the heading's counterweight, and
a heading that quietly lacks it reads as broken rather than unfinished.

**Expected shape:** `onNewPatient?: () => void` is already on
`PatientListScreenProps` and takes over from the toast the moment there is either
a create screen or a route to the booking flow.

</details>

### 2. Half-pixel type is resolved to the ramp, not reproduced

The mockups measure type in half pixels — the list alone asks for 26 / 15.5 /
14.5 / 11.5 — and `theme/tokens.ts` deliberately snaps them to one ramp, which is
how every screen built so far reads these same files. The list follows that: the
row name is `headline`, as it is on the day view's rows and the money screen's,
rather than a size of its own. Structure, weight, colour and copy are the
design's exactly; the sizes are the ramp's nearest.

The same goes for the 22px gutter (`size.gutter` is 20) and the search field's
48px height (`size.control`, and a tap target the desk uses constantly). Worth
revisiting as one decision across the app, never per screen.

### 3. The A–Z grouping is described, not drawn

`patients-list.html` ends with a line of prose: "A–Z groups continue below. In
Arabic the list sorts and mirrors right-to-left; chevrons point left." The
chevron half is built (`components/icons.tsx` swaps the glyph on
`I18nManager.isRTL`). The A–Z grouping is not designed anywhere — no band, no
index rail — and the server answers newest-first, so it is not invented here.

**Expected shape:** a designed screen showing what a group band looks like, and
`patient.recent` growing an `order` the client can ask for.

---

## Patient editor — 17 Aug 2026

Built against `patient-edit.html`, which the design gives both jobs: registering
a patient and correcting one. `PatientEditScreen` is that one screen, reached
from `New patient` on the list and from the record's `⋯` and its Details `Edit`.
`QuestionnaireSheet` and `CustomAnswerControl` are **deleted** — the editor
supersedes them exactly, with the same patch semantics plus the four basics, and
two ways to edit the same answers was the worse outcome. `patient.create` was
already on the router; nothing was needed on the server for this one.

### 1. The design asks for an age; the schema holds a date of birth

**Not a block — a resolution, recorded because it is lossy.**

`patient-edit.html`'s basics row is `Age · sex` and holds a whole number.
`patients` has no age column: `birth_date` is the fact and `age` is derived from
it at read time (`ageFromBirthDate`), deliberately, because a stored age is
wrong within a year of storing it.

**Resolved as:** the row is drawn exactly as designed, and an age of 34 is
written as `1 January (this year − 34)`. That reads back as 34 all year and as
35 next year — the patient ages, which is the point. What is lost is the day
they age *on*, which is what a clinic that only ever asked "how old are you?"
never knew either.

The lossy half is guarded rather than accepted: `birthDate` is only sent when
the age **string** on screen differs from the age the record arrived with. A
patient booked in through the day cluster — `patientDraft.ts` asks for the real
date off an ID card — therefore never has it flattened to 1 January by an editor
that was opened to fix their phone number. Covered in `patients.test.ts`.

**If this is wrong**, the fix is a designed date-of-birth row, not a code
change: `day/patientDraft.ts` already has the digits-only `DD / MM / YYYY` field
and its validation, and moving it here is an import once `domain/` exists.

### 2. `day/patientDraft.ts` and `patients/patientForm.ts` are the same module twice

Both hold a patient the desk is typing: name, phone, email, birth date, gender,
the blank-means-null rule, the loose email regex, the "too short to be a number"
check. They were written in different clusters against different designs — the
day one is a booking's first step, this one is the whole record — and neither
imports the other, because a screens cluster importing another cluster's module
is the coupling §10 exists to prevent.

**Expected shape:** `domain/patientDraft` owning the field-level rules
(`emailError`, `birthDateIso`, `GENDERS`, `orNull`), with each cluster keeping
only its own submission shape. Roughly 60 lines of the two would merge.

### 3. `ui/` has no dense form rhythm — the BASICS card is local

**Needed by:** the editor's four basics.
**Built:** `components/BasicsCard.tsx`.

`ui/Field` + `ui/TextField` stack a label *above* a 48px boxed control. That is
the rhythm of a form you fill in; the design draws the basics as a card you
correct — a fixed 78px label column on the start edge and the value typed
against it, four rows hairline-ruled inside one `ui/Card`. Four boxed fields
would be ~260px of chrome for four short facts.

**Expected shape:** `ui/Field` growing a `layout?: 'stacked' | 'inline'`, or a
`ui/DetailRow` that takes a label and any control. Every screen with a "what is
on file" card wants it; the settings cluster's `FixedDetailsCard` is the same
shape read-only.

### 4. `ui/SegmentedControl` cannot draw the design's `F` / `M`

**Built:** `SexToggle`, inside `BasicsCard.tsx`.

Two reasons, and the second is the real one:

- **Look.** `SegmentedControl` is System A's pill — a *white* thumb on
  `surface2`, sized for the two panes of a screen. The design's toggle is an
  `ink` fill with white type, riding on the end of a line of type inside a card.
  A filled half here has to read as an answer, not as a tab.
- **States.** It takes `value: T` and always draws a thumb. A patient nobody
  recorded a sex for is a third state, and `SegmentedControl` would show
  `Female` selected for every record that has no gender on it.

**Expected shape:** `value: T | null` on `ui/SegmentedControl`, plus a `tone` or
`variant` for the filled form. The null half is worth having regardless — it is
the difference between "not answered" and "answered with the first option".

### 5. `ui/NumericField` is a money control

**Built:** `NumberBox`, inside `AnswerEditor.tsx` — ~15 lines over
`ui/TextField`'s own boxed geometry.

`NumericField` draws its value at `type.amount`: a 20px DM Mono figure, right
for a price and wrong for "14 months ago", which at that size shouts across a
list of text answers. The box is `TextField`'s exactly, so the two sit in one
rhythm; only the face and the keyboard differ.

**Expected shape:** `size?: 'amount' | 'body'` on `ui/NumericField`. The rest of
it — Latin digits, mono, `decimal-pad`, the drawn placeholder — is already what
this needs.

### 6. The record's `⋯` — **resolved, as a pencil**

Entry 6 of *Patient record* said it was drawn with nothing behind it, because
everything a menu would hold was either elsewhere or unbuilt. Editing is now
built — and the bar draws a pencil rather than the mockup's `⋯`, at the
dentist's word.

A deliberate departure from `patient-view.html`, and the smaller lie of the two:
`⋯` promises a menu, and tapping it to land straight in an editor is a promise
broken every time. A pencil says the one thing the button actually does. It goes
back to `⋯` — `ui/PopoverMenu`, `Edit` at the top — the day a second action
(merge, deactivate, export) gives the menu something to be.

### 7. `notes` is on the record and on no design

`patients.notes` exists, `create` and `update` both take it, and the day
cluster's booking flow writes it. `patient-edit.html` draws no field for it and
neither does `patient-view.html`, so the editor does not send it — and, because
a patch leaves out what it is not given, a note written at booking survives
every save made here.

**Expected shape:** a designed row. It is a `ui/Textarea` and ten minutes
whenever the design says where it goes.

### 8. Half-pixel type is resolved to the ramp, not reproduced

The same decision as *Patients list* entry 2, and the same one app-wide.
`patient-edit.html` asks for 14.5 / 13 / 12.5 / 12 / 11 / 10.5px, a 22px gutter,
42px controls and a 16px card radius; `theme/tokens.ts` answers with `callout`
14, `subhead` 13, `footnote` 12, `caption` 11, `eyebrow` 10.5, `size.gutter` 20,
`size.control` 48 and `radius.xl2` 18. Structure, weight, colour role, copy and
spacing rhythm are the design's exactly.

The one visible consequence: the question controls are 48px rather than the
mockup's ~42, so six questions are ~36px taller than drawn. The mockup already
scrolls at six, so nothing is cut off — but it is the clearest argument yet for
revisiting the ramp as one app-wide decision rather than per screen.

### 9. `ui/ProgressBar`'s light track disappears on `canvas`

**Built:** `Progress`, inside `PatientEditScreen.tsx` — a view, a fill, and the
accessibility props.

Found on the emulator, not by reading: the questionnaire progress bar was simply
absent. `ProgressBar`'s `trackLight` is `color.surface2` (#f0f0f3), which is
drawn for a `surface` card; on this screen's `color.canvas` (#f4f4f6) it is a
four-value difference and invisible. The local one uses `color.outline`.

An empty bar is the case that matters, and it is the one the component cannot
draw. At `0 of 4` the track **is** the whole control — there is no fill to infer
it from — so a track that vanishes takes the entire "you have four to go" signal
with it. The design draws it a clear step darker than the page for that reason.

**Expected shape:** `ProgressBar` picking its track from the ground it is on —
a `on?: 'surface' | 'canvas'` prop, or `outline` as the light track throughout,
which is what every other hairline on `canvas` already uses.

### 10. `ui/Button` has no designed disabled state, only an opacity

**Built:** the save `Pressable`, inside `PatientEditScreen.tsx`, with its own
press lock.

Also found on the emulator. `Button`'s `disabled` is `{ opacity: 0.32 }` over
whatever fill the variant has — on `primary`, an `ink` fill and white type both
faded onto `canvas`, which rendered `3 required left` as grey on grey and
effectively unreadable. The label of a disabled button here is the one that has
to be read: it is not decoration on a dead control, it is the instruction for
how to bring the control back.

The design says so, and says it as two colours rather than as a fade —
`rgba(0,0,0,.12)` fill under `rgba(0,0,0,.45)` type, which is `surface2` under
`muted`. Contrast survives because the type darkens as the fill lightens; an
opacity moves both the same way.

**Expected shape:** a `disabled` *state* on each variant — `surface2`/`muted`
for `primary` — rather than one opacity applied to all of them. The pressed
state is already per-variant; this is the same treatment for the other one.

### 11. A **required** `date` question makes intake impossible

The sharp edge on §7.9, found reading the diff rather than on screen.

`date` has no control, so the editor draws it read-only. `validateIntake`,
though, requires an answer to every *active required* question — not merely the
ones the client can draw. So a clinic that ticks "required" on a date question
can no longer register anybody here: every Save comes back
`A required question was left blank.`, naming a field the desk can see and
cannot fill.

**Handled, not fixed:** `unaskableRequired` spots it and the screen says so —
Save is refused with the question named and the way out (make it optional in
Settings) rather than a round trip that always fails. Editing is unaffected;
`validatePatch` judges only the keys it is sent, so an edit leaves a question it
cannot draw exactly as it found it.

**The real fix is the control.** Putting `'date'` in `EDITABLE_KINDS` and
returning a field from its case in `AnswerEditor` — the digits-only
`DD / MM / YYYY` from `day/patientDraft.ts` is the one to move, which makes this
entry 2's problem again. Until then nothing stops a dentist ticking the box in
Settings, so the editor has to survive it.

---

## Money dashboard — 17 Aug 2026

### 14. `balance.summary` is missing three fields the design spends

**Needed.** `money-dashboard-v2.html` draws two things the period summary cannot
answer:

- the hero's `41.6k · 12 patients` — how many patients this period's shortfall
  is spread across
- the whole "Older visits · 18.5k EGP · collected · 6 visits" card — money that
  arrived in this period against a visit charged in an earlier one

Neither is derivable on the client. `balance.outstanding` is a *standing* figure
over every unpaid visit, not this period's, so counting its rows would answer a
different question and answer it confidently.

**Expected shape.** `balance.summary` already returns `{ charged, collected }`
for a date range. It should also return:

```ts
duePatients: number;     // patients with an unpaid balance from this period
olderCollected: number;  // piastres collected here against earlier visits
olderVisits: number;     // how many visits that was
```

`olderCollected` is the one with a real query behind it: payments whose
`paid_at` is in the range and whose visit's date is before it. It is not
`collected - charged` — that surplus only appears when the period collects more
than it charged overall, and a period can settle old debt without doing that.

**Built instead.** `_LocalMoneyApi`'s `PERIOD_FIXTURES` carries all three as
fixture values, taken from the design's own dataset. The screen renders them
like any other server figure and does no arithmetic on them.

**Note.** Server-side gap, and a bigger one than #5 — `balance.takings` is a
missing endpoint on an existing service, this is a missing join. Until it
lands, the "Older visits" card is the only thing on the dashboard whose figure
is not something the server has actually computed.

### 15. `--older` was a design token with no rule — **resolved**

BLOCKED #9 and the theme README both left `--older` out on the grounds that it
was `success` at a second value with no rule saying when it applied. The money
dashboard is the rule: money in against an earlier visit. It is `color.older`
now, with one caller. `--discount` is still out, for the original reason.

---

## Settings, second pass — 19 Aug 2026

The cluster was built from `settings.html` before that file grew its six panes.
This pass brings it up to the mockups (`settings.html`,
`settings-patient-fields.html`, `settings-procedures.html`). Four panes are new
— App, Appointments, Reminders, Clinic — and none of the four has a server
behind it.

### 16. ~~Four settings groups with no procedures behind them~~ — **wrong, not blocked**

**This entry was mistaken and is kept as a correction rather than deleted.**

It claimed the server stored none of the clinic identity, duration or reminder
settings, and documented the `_LocalApi` stand-ins built for them as necessary.
The server has had all of it the whole time:

- `settings` — `clinic_name`, `clinic_phone`, `duration_options` (int array),
  `default_duration`, `reminder_lead_hours`, `reminder_notify_at`,
  `reminder_repeat_minutes`, `reminder_template`
- `settings.get` / `settings.update`, with `updateSettingsInput` validating
  every field

The mistake: the cluster's existing stand-in only mirrored
`settings.schedule` / `setDay` / `clearDay`, and that was taken as evidence the
rest of the module was equally bare instead of reading `settings.router.ts`.

**Still true.** `AppScreen`, `AppointmentsScreen`, `RemindersScreen` and
`ClinicScreen` currently call `api.appointmentSettings` / `api.reminderSettings`
/ `api.clinic` in `data/_LocalApi.ts`, so the panes run on fixtures. That is now
a **to-do, not a blocker** — wiring them to `settings.get` / `settings.update`
is a change of import and two shape conversions:

- `reminderNotifyAt` is a Postgres `time` (`"HH:MM"`); the pane models minutes
  from midnight, which is what the stepper steps.
- the server allows a 1000-character template; the pane enforces the mockup's
  320.

**Genuinely absent.** Nothing raises the daily notification `reminder_notify_at`
and `reminder_repeat_minutes` describe. The pane stores the preference and no
scheduler reads it.

### 17. The language toggle has nothing to translate against

**Needed by:** `AppScreen`.

`settings.html`'s App pane offers EN / ع and promises it "changes the interface
everywhere, including printed receipts". `@lustre/shared` exports `Locale` and
the ramp knows about Arabic faces (`theme/fonts.ts`, `Text`'s per-string script
detection), but there is no i18n provider, no string catalogue, and nothing that
re-renders on a locale change.

**Built instead.** The control is real and the preference is real — it is state
on `SettingsScreen` next to the role, passed down as `locale` /
`onChangeLocale`, so wiring it to a provider is a change of where the state
lives and nothing else. **What it does not do yet is change any text.** This is
the one control in the cluster that currently looks like it works and does not,
and it should not ship to a clinic in that state.

**Expected shape.** A provider owning `Locale` plus `I18nManager.forceRTL`, with
the catalogue in `packages/shared` so server-side receipt rendering reads the
same strings.

### 18. `Branch` carries four fields the server has never had

**Needed by:** `BranchesScreen`.

The design's branch list draws a second and third line per branch — the address,
then `842 · since 2019` — and the branch editor has a phone field. `branches`
has `id`, `name`, `address`, `active`.

**Built instead.** `data/types.ts`'s `Branch` gains `phone`, `patientCount`,
`openedYear` and `closedOn`, and `_LocalApi` fills them from the design's own
dataset. `closedOn` is stamped when a branch is deactivated and deliberately not
cleared on reactivation. `patientCount` is the one that needs a real query
(patients whose visits name the branch); the other three are columns.

### 19. Nothing knows which branch the phone is standing in

**Needed by:** the identity card's second line, and the branch list's
"YOU'RE HERE" tag.

This is BLOCKED "Which branch — Day view" reaching a second cluster, and the
settings index makes the question unavoidable: the card under the title names
the branch this device is at, which is exactly the device-level setting that
entry says the app shell should own.

**Built instead.** `api.branch.current()` returns a module-level id in
`_LocalApi`, defaulting to the first branch and moved off a branch that is
deactivated. There is no UI to change it, because the design has none — it
belongs to onboarding, with the server address.

### 20. Working hours and Users have no slot in the design's IA

`settings.html`'s index is three groups — GENERAL, CLINIC, ABOUT — and neither
`WorkingHoursScreen` nor `UsersScreen` appears in any of them.

**Users:** resolved by deletion. The design replaces the pane with a role-switch
sheet on the index, which is a better fit for what the role actually is; the
"there are no accounts" reasoning moved into `components/RoleSwitchSheet.tsx`.
Nothing was lost — the role is still switchable, in one tap fewer.

**Working hours:** kept, and this is the pass's one deliberate deviation from the
mockup. It is a row in the CLINIC group (`glyph="hours"`, the only icon in
`components/icons.tsx` without mockup path data), because the alternative was
deleting a working screen over an omission in a design file that never mentions
opening hours at all. Delete the row and the import if the omission was
intentional.

### 21. `clock12` copied out of the day cluster

**Needed by:** `RemindersScreen` (the notify-at stepper, the preview stamp) and
the connection card's "last checked".

`screens/day/time.ts` already has it. Importing across clusters is what turns two
clusters into one, so it is `components/_LocalClock.ts` here, the same call
`_LocalMoneyValue` makes. Both collapse into `domain/` when it exists.

### 22. `ui/Stepper` could not label its value

**Resolved in `ui/`, not worked around.** The reminders pane steps hours, a time
of day and a repeat interval, and the mockup labels all three (`24 h`,
`6:00 PM`, `30 min`). `Stepper` rendered `String(value)`. It now takes an
optional `format`; the number stepped, the bounds and the accessibility value
are unchanged, so no existing caller moves.

### 23. Deltas from the mockups, taken deliberately

- **Type sizes and the gutter** resolve to `theme/tokens.ts` as always (§ the
  standing decision): the mockups' 27 / 20 / 15.5 / 13.5 / 12.5 / 11.5px land on
  `title` / `title3` / `body` / `subhead` / `footnote` / `caption`, and the 22px
  gutter on `size.gutter`. The identity card's 20px radius resolves to
  `radius.xl2` (18).
- **"YOU'RE HERE"** is drawn `tone="ink" variant="filled"` — the soft grey chip
  the cluster already uses for REQUIRED — rather than the mockup's solid ink fill
  with white text. A fourth `Tag` variant for one tag on one screen is the
  per-screen override the ramp exists to prevent.
- **`isToothSpecific`** keeps its switch in the procedure editor. The mockup's
  properties card lists only quantity, checkup and active, but the flag is real,
  the row still shows a TOOTH tag, and the visit screen reads it.
- **Patient fields keeps deactivate over the mockup's delete**, and keeps the
  answer type locked once a question exists. Both are older decisions in this
  cluster (the delete that orphans answers was removed on purpose); the mockup's
  "answers are kept but hidden" sheet describes deactivation in delete's words.
- **Bilingual labels.** `settings-patient-fields.html` and
  `settings-procedures.html` both draw an English and an Arabic input per name.
  `custom_questions.label` and `procedures.name` are single columns, so the
  panes take one label and `Text` picks the face per string. Two columns and a
  migration, not a screen change.
