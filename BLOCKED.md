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
