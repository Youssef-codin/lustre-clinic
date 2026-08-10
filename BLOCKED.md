# BLOCKED

Component Inventory §10. What each parallel agent needed and did not find, what
it built locally instead, and the shape it expects when the real thing lands.
Read before code review; each entry is either promoted into `ui/` / `domain/`
before the merges, or resolved as genuinely cluster-local and left alone.

---

## Patients cluster — `packages/app/src/screens/patients/`

### 1. tRPC client and TanStack Query (SPEC §18 F2)

**Needed by:** patient list, search, patient record, saving custom answers.

Neither exists. `@trpc/client` and `@tanstack/react-query` are not in
`packages/app/package.json`, and adding them means editing `package.json` and
`bun.lock` — the two files four worktrees would all land on at once, which is
what §10 exists to prevent.

**Built locally:**

- `data/_LocalPatientsApi.ts` — the five procedures this cluster calls
  (`customQuestion.list`, `patient.search`, `patient.byId`, `patient.update`,
  `balance.outstanding`) over fixtures, with the server's own answer coercion
  and gap audit reimplemented from `customQuestion.service.ts` so the screens
  meet the real failure modes rather than a stub that always succeeds.
- `data/_LocalQuery.ts` — `useQuery` / `useMutation`. Loading, error, refetch,
  pending, and a sequence number so a stale search answer cannot overwrite a
  newer one. No cache, no retries, no invalidation.
- `data/types.ts` — the payload shapes, hand-mirrored from the server services.

**Expected shape when the real client lands:** the call sites are already
`const x = useQuery(...)` / `const m = useMutation(...)` with the same fields, so
the swap is the four function bodies plus deleting `data/types.ts` in favour of
`inferRouterOutputs<AppRouter>`. `Date` columns are typed as ISO strings here;
if the client is configured with superjson they become `Date` and the two
`.slice(0, 4)` / `.slice(0, 10)` date reads in the record screen change with it.

### 2. A navigator (SPEC §18 F3)

**Needed by:** list → record, and the back that returns.

**Built locally:** `PatientsCluster.tsx` holds one piece of state — which of the
two screens is on top. Both screens take the props a stack would give them
(`onOpen(patientId)`, `onBack()`), so the file becomes a two-route stack and
nothing else changes.

**`App.tsx` is deliberately not edited.** It is the one file all four clusters
would otherwise land on together. To see this cluster, mount `<PatientsCluster
/>` in place of `<GalleryScreen />`.

### 3. `domain/` does not exist

§10 lists `domain/MoneyValue`, `domain/PatientRow` and `domain/StatusPill` as
pre-built and frozen. The `domain/` folder was never created, so:

| Built locally | Should be promoted to | Props |
| --- | --- | --- |
| `components/_LocalMoneyValue.tsx` | `domain/MoneyValue` | `{ amount: number /* piastres */, tone?: TextTone, variant?: TextVariant, locale?: 'en' \| 'ar' }` |
| `components/_LocalPatientRow.tsx` | `domain/PatientRow` | `{ patient: Patient, due?: number, onPress: () => void }` |
| `components/_LocalVisitRow.tsx` | `domain/VisitRow` | `{ visit: PatientVisit }` |

`MoneyValue` is the one that matters: §7.12 says money is formatted at the edge
in exactly one place, and there are now at least two of these across the four
worktrees. Promote it before the merges and delete the copies.

`domain/StatusPill` was **not** needed. `patient.byId` returns visits, not
appointments, so the payload carries no `status` — what a record can say about a
visit is whether it is settled, which is derived from the balance (§10) and
drawn with `ui/Tag`.

### 4. No loading skeleton in `ui/` (§7.14)

§7.14 lists list loading skeletons as an acknowledged gap with no design.
**Built locally:** `components/_LocalSkeleton.tsx` — static blocks at the row's
own height and inset, so the screen does not jump when the answer lands. No
animation: a shimmer needs a gradient dependency the app does not have.

If §7.14 is ever designed, this is a `ui/` primitive, not a cluster one.

### 5. Localisation scaffold (SPEC §18 F4)

Every string in this cluster is English in the source. There are no
dictionaries, no `Locale` context and no `I18nManager.allowRTL` call yet, so
there is nothing to read a locale from.

The two places it will be needed are already props rather than decisions:
`_LocalMoneyValue` takes `locale` (§7.13 — `EGP 2,600` vs `2,600 ج.م`), and
nothing in the cluster sets a font face by hand, so Arabic content already
renders correctly through `<Text>`'s per-string detection today.

### 6. No date control in `ui/` (§7.9)

The server accepts a `date` custom question and stores it as `YYYY-MM-DD`
(commit `16be0d2`), so a record can arrive holding one. `ui/` has no date field
and picking a calendar is not this cluster's call.

**Resolved, not stubbed:** `components/customFields.ts` lists the kinds it can
edit (`text`, `number`, `boolean`, `select`); a `date` answer is *displayed*
read-only on the record and never routed to an editor, so it can neither
disappear nor be dropped by a save. Dropping it in later is adding `'date'` to
`EDITABLE_KINDS` and returning a control from the one `case` that says so.

> Worth flagging: the brief for this cluster said date "is designed but not in
> the schema". It is in the schema — `QUESTION_KINDS` in `@mawid/shared` and the
> `coerce` switch in `customQuestion.service.ts` both carry it. The instruction
> not to build it now was followed regardless; this is only a note that the
> reason has changed from "the backend can't store it" to "`ui/` can't pick a
> date yet".

### 7. Visit rows have nowhere to go

`domain/VisitRow` on the patient record is drawn but not tappable: the visit and
payment screens belong to other clusters and there is no route to them. It takes
no `onPress` rather than carrying a dead one. Wire it when the navigator lands.

### 8. Not in scope, so not built

The fixed patient details (name, phone, email, birth date, sex) are **read-only**
on the record. The brief scoped this cluster to list, search, record and custom
fields; `patient.create` and editing the fixed details are a patient-edit screen
that nobody has been assigned. `patient.update` already takes them.
