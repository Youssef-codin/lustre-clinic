# BLOCKED

What the parallel screen agents needed and did not have. Component Inventory
§10: append here, build a `_Local` version inside the cluster, carry on.

Read this first thing after a run, before any code review. Each entry is either
promoted into `ui/` or `domain/` before the merges, or resolved as genuinely
cluster-local and left alone.

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

**Prop shape expected of the real thing:** none — this is a swap of import.
`data/types.ts` mirrors the server service return types field for field, and
each screen calls `api.<module>.<procedure>(input)`. Deleting `_LocalApi.ts` and
pointing `api` at the tRPC client should not touch a screen.

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

### 3. No navigator

**Needed by:** the settings index → its five panes.
**Built:** a route union inside `SettingsScreen`, one pane at a time in
`ui/PushView`.

F1/F3 have not landed and §10 forbids adding a navigator. `PushView` is the
transition the settings designs draw anyway, so this is not a workaround so much
as an early version of the real thing. Lifting the panes out is a change of
`setRoute` to `navigate`; each pane already takes an `onBack`.

### 4. Nothing mounts the settings screen

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

### 5. `packages/app/tsconfig.json` needed `allowImportingTsExtensions`

**Edited a shared file** — flagged here because §10 says not to.

`@mawid/shared` is source, not a build artefact, and `index.ts` re-exports its
siblings with explicit `.ts` extensions. The app's tsconfig extends
`expo/tsconfig.base` rather than the repo's `tsconfig.base.json`, so it did not
carry the flag, and the **first** app file to import the contract fails to
typecheck. That is every cluster, not just this one. One line, and the merge is
identical in all four branches.

Related, not fixed: importing `@mawid/shared` pulls **zod** into the RN bundle,
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

- **`domain/BottomTabBar`** — cross-cluster (§10: built before the parallel run,
  never during). The settings screen has no tab bar under it.
- **`domain/BrandWordmark`** — also cross-cluster (day view). The settings header
  renders "MAWID" as an eyebrow `Text` rather than claiming the name.
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
