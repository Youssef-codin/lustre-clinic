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
