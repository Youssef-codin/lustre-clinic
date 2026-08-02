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

## 2. Blocker — the built frontend does not talk to the server — **FIXED**

Resolved by fix 1 below: `packages/web/src/mocks/` and the `main.tsx` gate are
deleted, and the default build is now `build.ts --production`. Re-verified in a
real browser — see §2b. The original diagnosis is kept below for the record.

**This was the one thing to fix before anything else, and it was invisible from
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

## 2b. Second bug, found only by doing that browser check

Taking fix 1 walks straight into a second one, and §7's own run instructions hit
it too. `build.ts` applied `[dir]/[name]-[hash].[ext]` to **every** output in
production mode, including the HTML entrypoint — so `--production` emitted
`index-dn83kz61.html`, while `static.ts:31` serves `public/index.html` by that
exact name. Every route returned the 503 `Frontend not built.` plain-text body.

A production build had therefore never actually been served: the default build
was the dev one (that was §2), and the only build anyone would have reached for
instead was broken. The two bugs hid each other.

Fixed by splitting `naming` so hashes apply to chunks and assets but never to
the entry — Bun rewrites the `<script>`/`<link>` hrefs to the hashed names
either way, so cache-busting is unaffected.

Verified in Chrome against a real server on `:8099`, production bundle:

| Step | Verified result |
|---|---|
| App loads | RTL Arabic desk view, all four health chips green, websocket chip live |
| Really the backend | DevTools shows 7 real `GET /api/*` requests, all `200` — under the mocks this list was empty |
| Book a walk-in | Clicked 18:00, "مريض جديد", `سارة محمود` / `01012345678` → booked from the browser |
| Normalization | Row renders `+201012345678` |
| Ref | `010826-01`, and `startsAt` `15:00Z` = 18:00 Cairo |
| Slots update | 18:00 disappeared from the available list |
| **Survives reload** | Still there after a full page reload — the exact symptom the mocks faked |
| Auto-print | `slip-010826-01.pdf` (108 KB) written on booking, no UI action needed |
| Scan | Navigating `/s/010826-01` redirected to `/p/1` and rendered the patient page |
| Console | Completely silent — no errors, and no React dev warnings, confirming a true production bundle |

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
- ~~**`seed` script** — §3 lists one; it does not exist.~~ Built, see §8.
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

The `web` branch and its worktree have since been deleted, so the hazard is
closed — there is no branch left to merge from, and `ea392fa` survives only as
history inside `main`. Do not resurrect that branch from before `3735006`.

**The loose end about `c0b3317` not being a merge commit is now moot.** That note
proposed `git merge -s ours server` to record the relationship. The `server`
branch no longer exists — `git for-each-ref` matches nothing named `server`,
locally or on `origin` — so there is no ref to merge from and nothing left to
replay against a stale base. The content is in `main` and that is the whole of
it. No action needed; the command in earlier revisions of this doc will just
fail with `merge: server - not something we can merge`.

---

## 7. How to run it

`config.json` is gitignored. `MAWID_CONFIG` points the server at one anywhere,
which keeps test runs out of the repo:

```bash
cp config.example.json /tmp/mawid/config.json
# set database / whatsapp.sessionPath / printing.outputDir / backups.local
# to absolute paths
bun run build                                        # production by default now
MAWID_CONFIG=/tmp/mawid/config.json bun packages/server/src/server.ts
```

`bun run build` is production since §2; the `--production` flag is no longer
something you have to remember. `bun run dev` still builds in development mode
(sourcemaps, unminified) and watches — that path is unchanged apart from no
longer having a mock API behind it, so it now needs the server running to do
anything.

The example config is already demo-safe: `printing.driver: "file"` writes PDFs to
a folder instead of a printer, and `whatsapp.dryRun: true` logs messages instead
of sending them. Both must stay that way until §5's hardware checks are
deliberately started.

Useful facts for a smoke test: a booking needs a `startsAt` inside `config.hours`
for that weekday **in Cairo time** (UTC+3 in August), and `/api/slots` is the
quickest way to find one that will be accepted.

---

## 8. Demo data, sample printouts, and the patient lookup

Three things added after the §2 fix, in response to the gap in the middle one.

### `bun run seed`

Fills the configured database with data that exercises every screen: 8 patients,
~72 appointments spanning 21 days back to 14 days forward, all 6 appointment
types, all 4 statuses, both channels, and reminders in `sent` / `failed` /
`skipped` (both reasons) / `pending`. Patient histories run 6–11 visits so the
patient page has something real to render.

Appointments are booked through `createAppointment`, not inserted directly — so
the seed cannot produce data the app would reject. Refs come from the real
sequence, working hours and the overlap rule are enforced, reminder rows are
created, and slot times come from `findOpenSlots`, so editing `config.hours`
changes what the seed books instead of breaking it. Printing is forced to the
`none` driver for the run. Status and reminder-state assignment is deterministic
(`id % n`), so two runs give the same database and a bug found once is findable
again.

It refuses to run on a non-empty database; `--reset` wipes first.

### `bun run sample-print` → `docs/`

Renders `sample-slip.pdf` and `sample-day.pdf` using the *real* renderers the
print queue calls, so what is in `docs/` is exactly what comes out of the
printer — Arabic shaping, bidi, and QR included. Both are committed, because the
layout of a bidirectional document is not reviewable from source.

**The QR decodes.** `zbarimg` reads `http://mawid:8099/s/150826-02` straight off
the rendered slip. That does not replace §5's camera test, but it does close the
half of it that was about the payload rather than the optics — the geometry
tests only ever checked the matrix.

It also makes the §6 hostname trap concrete: with the example config's
`hostname: "mawid"`, every printed slip points at a host a phone on the clinic
wifi will not resolve. Setting `hostname` to `localhost` makes `printBaseUrl()`
substitute the detected LAN IP instead. Check the decoded URL before printing
anything anyone will keep.

### Patient lookup on the desk

The desk had no way to find a patient. `GET /api/patients?q=` was built, matching
name *or* phone (digits normalized, so `01198765432` finds `+201198765432`), and
`usePatientSearch` was built on top of it — but its only consumer was
`PatientPicker`, which renders **inside the booking sheet, after a slot has been
clicked**. So the only routes to a patient's history were scanning a QR code or
clicking someone who already had an appointment *that day*.

For the patient who phones asking when their appointment is, or arrives without
their slip, the secretary's only move was to start a booking she then had to
remember to abandon. `PatientLookup.tsx` is the missing entry point: a search box
above the date nav, results linking to `/p/:id`. Nothing underneath it is new —
endpoint, hook, detail page and history component all already existed.

This is a seam gap rather than anybody's mistake: the web worktree built the
search as a booking affordance, the server worktree built the endpoint, and the
standalone screen belonged to neither and appears in no day of §13.

---

## 9. Printing and the phone scan — closed

§5's first hardware item is done: a slip printed on a real printer, scanned with
a real phone, opened that patient's page, and the desk followed the scan by
itself. Two bugs stood in the way, neither visible from the dev machine.

### Printing

Nothing needed building — the `pdf` driver already shells out to `lp` on Linux
and CUPS was ready. It had simply never been switched on. Config now reads
`driver: "pdf"` with an explicit `printerName`.

### Bug 1 — the QR pointed at an unresolvable host

`hostname: "mawid"` does not resolve, even on the machine that prints. Every
slip would have carried a dead QR. Setting `hostname: "localhost"` makes
`printBaseUrl()` substitute the detected LAN IP. `sample-print --print` now
reports the QR's target on every print, because a slip whose code points
nowhere is indistinguishable from a good one on paper.

### Bug 2 — `upgrade-insecure-requests`, and why nothing caught it

Helmet merges its own defaults into whatever `directives` you pass, so the CSP
carried `upgrade-insecure-requests` even though `app.ts` never asked for it —
sitting right beside the `hsts: false` that was set deliberately for the same
reason.

The effect: the page loads over http, then the browser rewrites the CSS and JS
to **https**, which nothing here answers. Blank page, no console error.

It cannot be reproduced on the dev machine. Browsers treat `localhost` as a
potentially trustworthy origin and skip the upgrade, so every test over
`localhost` passes. It only fires over a LAN IP — which is only ever the phone
scanning a slip. **The one path that cannot be tested from the dev machine was
the only path it broke.** Note that CI would not have caught this either; only a
real request to a non-localhost address does.

Fixed with `upgradeInsecureRequests: null`.

### A trap for the rehearsal

Both bugs leave **cached** wreckage on the phone. After fixing the server the
phone still showed a blank page until it was opened in a private tab. Any
frontend change during rehearsal wants a private tab or cleared site data —
otherwise you are debugging a fix that already works.

### Not a bug: the desk shows no prompt

With no booking in progress a scan makes the desk **navigate** to the patient;
there is no banner to click. The banner only appears mid-booking, where
`beginEdit()` suppresses auto-follow so a scan cannot discard a half-typed form.
An idle desk that simply follows the paper is the intended behaviour.

---

## 10. WhatsApp (Baileys) — connected for the first time

The Baileys code had been written but **never run**: `@whiskeysockets/baileys`
was in `package.json` and imported, and the whole thing type-checked, but no
socket had ever opened. Everything below was verified by connecting to real
WhatsApp servers.

### It works

A socket against `7.0.0-rc14` opens and a pairing QR arrives in **about one
second**. Reconnect, backoff, session persistence and the logout path are as
written.

Verified on the **compiled binary** (`dist/mawid`), not just `bun src/server.ts`
— which matters more here than elsewhere: Baileys v7 pulls in
`whatsapp-rust-bridge`, and a native `.node` addon would not survive
`bun build --compile`. It ships its WASM inlined in a single 2 MB JS file, so
the single-file binary carries the whole stack. Nothing extra to install on the
clinic PC.

### Fix 1 — the QR was a string, and a string does not scan

Baileys hands over the pairing code as ~270 characters of text.
`setWhatsAppState({ qr })` passed it straight through, and `WhatsAppPanel`
checks `qr.startsWith('data:')` — so the desk landed on its text fallback and
showed base64 in a `<code>` block. The en/ar strings even name the cause:
*"the server did not render it to an image"*. Nobody can pair with that.

`services/whatsapp/qr.ts` now renders it to a PNG data URL with the `qrcode`
package the server already had for printing — the browser does not ship a second
QR encoder to redraw a value the server holds. Error correction **L**, not the
slips' **M**: the pairing string is near a QR's capacity, and a higher level
forces a denser code that scans *worse* on screen. A screen QR lives twenty
seconds and is never folded, so there is no damage to recover from.

A failed render falls back to the raw string rather than throwing — honest and
unscannable beats losing the ability to link at all.

### Fix 2 — a dead QR stayed on screen

WhatsApp reissues the pairing code every ~20s, and a socket close left the last
one on the desk. Two ways that misleads: a stale code after a disconnect, and —
because rendering is async — a slow render landing *after* the next code
arrived. Both look like a working QR that silently refuses to pair.

A `pairing` counter now invalidates in-flight renders, and a close clears the
code. Confirmed in a browser: the QR replaces itself live over
`whatsapp:status`, no reload.

### Fix 3 — numbers that are not on WhatsApp

`sendMessage` to a number with no WhatsApp account **resolves**. The row would
be marked `sent` and the patient never told — a silent failure, which §14 says
is the one thing this system must not do. `send()` now checks `onWhatsApp()`
first and throws, which lands the patient on the desk's "not reminded" list so
someone phones them. That list is the recovery path; it only works if failures
reach it.

A *failed* lookup is not proof of absence — only an explicit `exists: false` is.
A timed-out query still sends, otherwise a network blip silences reminders for
patients who are perfectly reachable.

### Smaller

- Dropped `printQRInTerminal` — removed in v7, deprecated in the types.
- `browser: Browsers.ubuntu('Mawid')` names the entry in the phone's *Linked
  devices* list. Months later someone has to know which session not to unlink.

### Still needs a handset

Pairing itself, and one live reminder to a real phone. Must be a dedicated
number, never the clinic's main line — and note the sending discipline in §8 is
about a number's *reputation*, so the first real sends should be few and spaced.

### The test button

Proving the link works needed a real appointment booked at a time whose reminder
happened to be due — which is a lot of ceremony, and it puts junk in the
database to answer one question.

`POST /api/whatsapp/test` sends one message to `config.whatsapp.testNumber`
down the same path a reminder takes: same sender, same template, same phone
normalization. The desk gets a **Send a test to …** button beside the linked
pill, and reports back the E.164 number actually messaged rather than the one
typed in config.

The recipient is config, deliberately **not** a request field. A free-text send
box on the busiest screen in the clinic is a way to message a patient by
accident. No test number configured means no button — a control whose only
possible outcome is an error is worse than none.

The message carries a `رسالة تجريبية · Test message` marker and a test patient
name. A clinic's test number is usually somebody's personal phone, and a message
that reads exactly like a real reminder is one someone will act on.

Numbers in the UI are wrapped in bidi isolates (U+2066/U+2069). Without them
`+201000946068` renders as `201000946068+` inside an Arabic sentence — correct
per the bidi algorithm, and useless for checking against what you configured.

### Trap — `bun run format` was rewriting the live session

`biome.json` sets `vcs.enabled: false`, so `.gitignore` is never consulted, and
`files.includes` did not exclude runtime state. Once a real pairing existed,
`bun run format` reformatted **1978 files** inside the Baileys session folder —
credential material, rewritten underneath a running socket.

Harmless as it happened (whitespace-only changes to JSON that Baileys parses
back the same), but only by luck. `session`, `backups` and `print-out` are now
excluded. The tell was the file count jumping from 160 to 2138.
