# Integration handoff

Both worktrees are merged into `main` (`c0b3317`). The server and the web app were
built in parallel against `packages/shared` and have **never run against each
other in a browser**. This document is the result of checking that seam.

Everything below was verified on `c0b3317` by booting the real server and driving
it over HTTP — not by reading code. Where something was *not* verified, it says so.

---

## 1. What is already working

`bun run typecheck` · `bun run lint` · `bun test` — all clean, **186 tests pass**.

A real server booted against `config.example.json` (port 8099, `file` print
driver, `dryRun` WhatsApp) serves the whole of §6 except one endpoint, and the
demo path in §13 works end to end over HTTP:

| Step | Verified result |
|---|---|
| Book a walk-in | `POST /api/appointments` with an inline `{name, phone}` → patient created in the same transaction, phone normalized `01012345678` → `+201012345678` |
| Ref format | `030826-01` — `DDMMYY-NN` off the appointment's clinic-local day |
| Double-book | Overlapping booking rejected with `SLOT_TAKEN`, message names the conflicting ref |
| Day view | `GET /api/appointments?date=` returns rows with `patient` embedded — no N+1 |
| Slots | `GET /api/slots?date=&typeId=rootcanal` correctly skips the 12:50–14:00 Cairo gap where 90 minutes will not fit before close |
| Print | `POST /api/print/slip/1` → `{queued:true}`, `slip-030826-01.pdf` on disk ~1s later |
| Scan | `GET /s/030826-01` → `302` to `/p/1` |
| Reminder scheduling | Row created at booking, `scheduled_for` snapped backwards from Sunday 17:00 Cairo (clinic closed) to 13:59 Cairo — §9's rule, working |
| Websocket | Connected client received `scan` and `appointment:created` live |
| SPA routing | `/` and `/p/1` serve `index.html`; `/api/nope` is a JSON 404, not the SPA |

Contract parity is complete: every URL the web app calls exists on the server,
and every websocket event the web app subscribes to is broadcast by the server —
including `reminder:sent` / `reminder:failed` / `reminder:skipped`, which are
emitted from `services/reminders/index.ts` via `announce()`.

---

## 2. Blocker — the built frontend does not talk to the server

**This is the one thing to fix before anything else, and it is invisible from
`curl`.**

`packages/web/src/main.tsx:18` installs a `fetch` interceptor from `src/mocks/`
whenever the bundle was built with `NODE_ENV !== 'production'`:

```ts
if (process.env.NODE_ENV !== 'production') {
    const { installMockApi } = await import('./mocks/index.ts');
    await installMockApi();
}
```

`packages/web/build.ts:16` only sets production mode on `--production` or
`NODE_ENV=production`. **The root build script passes neither:**

```jsonc
// package.json:10
"build": "bun run --cwd packages/web build && bun run --cwd packages/server build"
// packages/web/package.json:8
"build": "bun run build.ts"          // ← no --production
```

Confirmed by inspecting the output: a default `bun run build` emits a bundle
containing `installMockApi`, `MockStore` and `FALLBACK_CONFIG`, and the gate
evaluates true, so **the desk screen answers itself from an in-memory store and
never contacts the backend**. Adding `--production` drops the mock code from the
bundle entirely — that part works as designed.

So: the API tests in §1 pass because `curl` bypasses the browser. A person
clicking the UI would be driving mocks. Every symptom of this looks like
"integration works" — bookings appear, slots list, the day view fills in — right
up until the data does not survive a reload and no slip prints.

Fix, in order of preference:

1. **Delete `packages/web/src/mocks/` and the `main.tsx:18-21` block.** The
   server now implements every route the mocks stand in for; the file's own
   header says to delete it once that is true. This removes the failure mode
   rather than configuring around it.
2. If the mock layer is being kept for offline frontend work, make the default
   build safe: `"build": "bun run build.ts --production"`, and leave the mock
   path on `dev` only.

After that, re-verify **in a browser**, not with `curl` — that is the only way
this class of bug shows up.

---

## 3. Gap — `GET /api/stats?from=&to=`

The last unbuilt endpoint in §6. Currently a JSON 404. The contract is written
(`packages/shared/src/stats.ts`), nothing in the web app calls it, and `TODO.MD`
has the implementation notes including the one real trap: both bounds are
**clinic-local days** and have to go through `clinicDayBounds()`, because
`starts_at` is UTC and a string comparison silently drops the first and last few
hours of the range.

Worth knowing before scheduling it: **stats has no slot in §13's build order** —
it appears in §6 and in no day of the plan. §7 says it is the screen shown to the
doctor to justify the fee, and explicitly never printed. It is not on the demo
path, and §13 closes by saying features get cut before demo steps do.

---

## 4. Also outstanding

From `TODO.MD`, unchanged by this review:

- **CI** — no `.github/` exists. §3 asks for path-filtered `server.yml` and
  `web.yml`, both triggering on `shared/**` so a contract change is validated
  against both sides.
- **Backups (§11)** — nothing built. Note §14 defers the backups *UI*, not
  backups. `config.backups` is already modelled and validated.
- **`seed` script** — §3 lists one; it does not exist.
- **`escpos` driver** — deferred in §14. `driverFor()` falls back to the file
  driver with a warning rather than printing nothing silently.
- **Monitoring/alerting (§10)** — explicitly post-demo.

## 5. Needs hardware, not code

Neither can be closed from this machine:

- **Scan a printed slip with a real phone.** QR geometry is checked against the
  matrix in tests, but nothing here decodes a camera image. §9 calls this the
  demo's best moment; it is also the step with the most physical failure modes
  (phone and PC on the same wifi, `hostname` resolving, printed contrast).
- **Pair a real WhatsApp number and send one live reminder** (§13 step 14).
  Must be a dedicated number, never the clinic's main line (§8).

---

## 6. Repo hazard — the `web` branch deletes the backend

`ea392fa "get rid of backend stuff"` on the `web` branch deletes the entire
`packages/server` tree. It reached `main` through `3735006 "Merge branch 'web'"`,
and merging `server` on top of that produced 10 `DU` conflicts — plus **48
further backend files that were dropped with no conflict at all**, because git
only flags a path when both sides touched it. Those included `AppError.ts`,
`validate.ts`, `errorHandler.ts`, `db/index.ts`, `db/migrate.ts`, the `0000`
migration and its snapshot, and every handler/router/schema for the patient,
appointment, slots, config and health modules. Resolving only the visible
conflicts would have left a `main` that could not build — and the test suite
would have looked fine, because the tests were among the deleted files.

This was resolved in `c0b3317` by restoring all 107 files from the `server`
branch. `packages/shared` was byte-identical on both sides.

**The commit is still on `web`.** Any future merge from that branch repeats this,
with a different and equally silent set of casualties. Drop it from `web`, or
stop merging that branch.

---

## 7. How to run it

`config.json` is gitignored. `MAWID_CONFIG` points the server at one anywhere,
which keeps test runs out of the repo:

```bash
cp config.example.json /tmp/mawid/config.json
# set database / whatsapp.sessionPath / printing.outputDir to absolute paths
bun run --cwd packages/web build.ts --production      # note the flag — see §2
MAWID_CONFIG=/tmp/mawid/config.json bun packages/server/src/server.ts
```

The example config is already demo-safe: `printing.driver: "file"` writes PDFs to
a folder instead of a printer, and `whatsapp.dryRun: true` logs messages instead
of sending them. Both must stay that way until §5's hardware checks are
deliberately started.

Useful facts for a smoke test: a booking needs a `startsAt` inside `config.hours`
for that weekday **in Cairo time** (UTC+3 in August), and `/api/slots` is the
quickest way to find one that will be accepted.
