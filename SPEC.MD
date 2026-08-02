# Mawid — Technical Spec

Clinic appointment booking with automatic WhatsApp reminders and printed paper output.

**Deployments:** two clinics (dental, and a second clinic). Single-tenant — one install per clinic, nothing clinic-specific in source.

---

## 1. What it is

The secretary books appointments on a screen instead of writing them in a paper book. The system:

- prints a slip on every booking, and the full day's schedule each morning
- sends each patient a WhatsApp reminder before their appointment, automatically
- puts a QR code on every printed page that opens that patient's record

**The doctor wants everything physical.** The database is backup and audit; paper is what the clinic runs on. Every feature must produce or preserve paper.

### Non-goals (do not build)

- Patients booking themselves over WhatsApp
- Any chatbot / inbound conversation handling
- Payments, billing, clinical or treatment records
- Multi-tenancy, user accounts, role permissions
- Cloud hosting — this runs on the clinic's own PC

---

## 2. Stack

| Layer | Choice |
|---|---|
| Runtime | **Bun** + TypeScript |
| Database | **SQLite** via `bun:sqlite`, with **Drizzle ORM** |
| Migrations | `drizzle-kit` — generated, versioned, committed |
| Server | **Express 5** running on Bun, bound to `0.0.0.0` |
| WebSocket | `ws`, attached to the same HTTP server / port |
| Validation | **Zod** — requests and `config.json` |
| Logging | **pino** (+ `pino-pretty` in dev) |
| Tests | **`bun:test`** + supertest |
| Lint/Format | **Biome** (4-space, single quotes, 110 width) |
| Frontend | **React** + **Tailwind**, TypeScript, bundled with `bun build` |
| WhatsApp | **Baileys** (`@whiskeysockets/baileys`) |
| QR generation | `qrcode` |
| Printing | Abstraction layer — see §7 |
| Desktop shell | **None for now.** See §12. |

Single binary via `bun build --compile` so the clinic PC needs no Bun install.

**Gotcha:** `express.static(__dirname + '/public')` breaks inside a compiled binary — those files aren't on disk beside the exe. Either embed the built frontend and serve it from memory, or ship `public/` next to the binary and resolve paths relative to the executable. Decide this early; it surfaces at install time, not in dev.

### Frontend conventions

- **React** with function components and hooks. No state management library — component state plus a couple of contexts is enough at this size.
- **Tailwind** for styling. No component library; this is a form, a table, and a day view.
- One websocket connection opened at app root, shared via context. Events from §6 update state directly — no polling.
- The same SPA serves the desk view and the phone view. Responsive Tailwind handles the difference; do not build two frontends.
- **RTL:** set `dir="rtl"` on the document for Arabic. Use Tailwind logical properties (`ps-`/`pe-`, `ms-`/`me-`) rather than `pl-`/`pr-`, or the layout will mirror wrong.
- Touch targets sized for a phone — the doctor scans a slip and reads the result on his phone, and the secretary may be on a tablet.

### Architectural rule that governs everything

**The frontend talks to the backend only over HTTP, using relative URLs.**

- `fetch('/api/appointments')` — never `fetch('http://localhost:8080/...')`
- No Tauri `invoke()`, no Electron `ipcRenderer`, no shell-specific APIs anywhere in the frontend

Two reasons: the same UI must load from a phone on the LAN (where `localhost` would resolve to the phone), and a desktop shell can be added later by pointing a window at the server with zero frontend changes.

---

## 3. Project structure & conventions

Adapted from the house pattern. Dropped as not applicable: Redis, JWT auth, Prisma, Postgres, Docker/compose, multi-tenancy, k6.

### Monorepo

Bun workspaces, so backend and frontend can be built in parallel sessions.

```
mawid/
├── package.json              # { "workspaces": ["packages/*"] }
├── packages/
│   ├── shared/               # types + zod schemas — THE CONTRACT
│   ├── server/
│   └── web/
├── SPEC.md
└── config.example.json
```

**`packages/shared` is built first, before either side starts.** It holds every API request/response type and the Zod schemas they're validated with. The server imports them to validate; the web app imports them to build against. That means the frontend can build the entire booking screen against types that have no implementation yet, and neither side blocks the other.

**Rule: neither side edits the other's package.** If the frontend needs a different response shape, that's a change in `shared`, and the server side picks it up. Without this you get merge conflicts in precisely the files that are worst to resolve.

### Parallel sessions

Git worktrees — two directories, two branches, one repo, no stashing:

```bash
git worktree add ../mawid-server feat/server
git worktree add ../mawid-web    feat/web
```

Before the server exists, the web session develops against mock handlers typed from `shared`. After it exists, against `localhost:8080`.

### CI

Two workflows, `server.yml` and `web.yml`, each path-filtered:

```yaml
on:
  pull_request:
    paths: ['packages/server/**', 'packages/shared/**']
```

Both trigger on `shared/**` — a contract change must be validated against both sides.

### Backend layout — `packages/server/`

```
packages/server/
├── src/
│   ├── app.ts                    # express app: middleware chain + router mounting
│   ├── server.ts                 # entrypoint: config → migrate → services → listen
│   ├── modules/                  # HTTP feature modules (the core pattern)
│   │   ├── patient/
│   │   ├── appointment/
│   │   ├── reminder/
│   │   ├── print/
│   │   ├── whatsapp/
│   │   └── health/
│   ├── services/                 # long-running, not request-driven
│   │   ├── whatsapp/             # Baileys socket, session, reconnect
│   │   ├── printer/              # PrintDriver implementations + queue
│   │   ├── reminders/            # scheduling, tick loop, catch-up
│   │   ├── backup/
│   │   └── alerts/               # post-demo
│   ├── middleware/
│   │   ├── validate.ts           # zod schema → 400 on failure
│   │   ├── errorHandler.ts       # central error mapper + ERROR_CODE enum
│   │   └── logger.ts             # pino instance + request-log middleware
│   ├── errors/AppError.ts        # class AppError { status, message, code }
│   ├── db/
│   │   ├── schema.ts             # drizzle schema
│   │   ├── index.ts              # db singleton
│   │   └── migrations/           # generated, committed
│   ├── ws/                       # ws server + typed event emitter
│   ├── config/                   # load + zod-validate config.json
│   └── util/
│       ├── apiresponse.ts        # ok() / fail() / respond() envelope
│       ├── schema.helper.ts      # inBody / inParams / inQuery
│       └── time.ts               # UTC ↔ clinic timezone, working-hours math
├── public/                       # built frontend, copied from packages/web
├── tests/
└── config.json                   # gitignored; config.example.json is committed
```

### Frontend layout — `packages/web/`

React + Tailwind source. Builds to `packages/server/public/`, which the server serves statically. Imports types and schemas from `packages/shared` — never duplicates them.

### The module pattern

Every HTTP feature is a folder of exactly four files:

```
modules/<name>/
  <name>.router.ts      # route table; wires validate(schema) → handler
  <name>.schema.ts      # Zod schemas + inferred TS input types
  <name>.handler.ts     # HTTP only: unwrap req, call service, respond()
  <name>.service.ts     # business logic + db; throws AppError
```

Rules that hold everywhere:

- **Handlers never touch the database.** They read `req.params/body/query`, call a service, and return `respond(res, status, ok(data))`.
- **Services never touch `req`/`res`.** Plain arguments in, `AppError` thrown on failure.
- **Handlers are async with no try/catch** — Express 5 auto-forwards rejected promises to the error handler. **Pin Express 5**; this convention depends on it.
- **Routers are default-exported** and mounted in `app.ts`.
- **Static routes before param routes** — `/patients/search` must be registered before `/patients/:id` or it gets swallowed.

### `services/` vs `modules/`

`modules/` is request-driven. `services/` holds things that run on their own — the Baileys socket, the reminder tick, the print queue, backups.

Long-running services are started in `server.ts` after migrations and receive the db and config as arguments. Module services may call into them (e.g. `print.service.ts` enqueues to the printer service), never the reverse — a background service must not reach into an HTTP module.

### Errors

`AppError { status, message, code }`, mapped centrally in `errorHandler.ts` against an `ERROR_CODE` enum. Domain failures throw typed errors — `SLOT_TAKEN`, `PATIENT_NOT_FOUND`, `PRINTER_UNAVAILABLE`, `WHATSAPP_DISCONNECTED` — so the frontend can react to a code rather than parse a message.

### Validation

Zod at every boundary: request bodies, params, query, **and `config.json` at boot**. A malformed config must fail loudly at startup with a readable message, not surface as a strange bug at 6pm when a reminder doesn't send.

### Responses

`ok()` / `fail()` / `respond()` envelope, consistent across every endpoint.

### Logging

pino, with `pino-pretty` in dev and a file target in production. Log at minimum: every reminder send attempt and outcome, every print attempt and outcome, WhatsApp connection state changes, and the applied migration version at boot.

**Never log patient names, phone numbers, or notes.** IDs only. Logs get copied around during debugging and this is medical data.

### Security

`helmet`, 1mb body limits. No auth in v1 — the app is LAN-only. If the clinic wifi is shared with patients, add a single shared password before going live; leave the middleware seam for it.

### Tests

`bun:test` (native, no config needed on Bun). Vitest works too if preferred, but on Bun the native runner is less friction.

- **Unit:** services with the db mocked. Assert thrown `{ status, code }`.
- **Integration:** supertest against the real app with a real SQLite file; `resetDb()` in `beforeEach`. SQLite makes this much cheaper than the Postgres setup — no containers, use a temp file per run.
- **The overlap check gets its own dedicated tests.** Every boundary: exact same start, ends-exactly-when-next-begins, fully contained, spanning. This is the one guarantee that must not break.
- Also cover: reminder scheduling snapped to working hours, catch-up skip rules, timezone conversion.

### Tooling

Biome (4-space indent, single quotes, 110 width). Scripts: `dev` (bun --watch), `build`, `type-check`, `lint`/`lint:fix`, `test`, `db:generate`, `db:migrate`, `seed`.

CI: GitHub Actions on push/PR — install → type-check → lint → test. No service containers needed.

### Secrets vs config

`config.json` holds clinic settings and is meant to be edited by you at install. Secrets — backup encryption key, alert tokens — go in `.env`, never in `config.json`, and never in the repo.

---

## 4. Config

Nothing clinic-specific in source. Load `config.json` at boot; fail loudly with a clear message if it's missing or invalid.

```jsonc
{
  "clinic": {
    "name": "عيادة ...",
    "nameEn": "... Clinic",
    "phone": "+20...",
    "address": "...",
    "timezone": "Africa/Cairo"
  },
  "hours": {
    // 0 = Sunday. Omit a day to mark it closed.
    "1": [{ "from": "10:00", "to": "14:00" }, { "from": "17:00", "to": "21:00" }],
    "2": [{ "from": "10:00", "to": "14:00" }]
  },
  "appointmentTypes": [
    { "id": "checkup",   "label": "كشف",       "minutes": 20 },
    { "id": "cleaning",  "label": "تنظيف",     "minutes": 30 },
    { "id": "filling",   "label": "حشو",       "minutes": 45 },
    { "id": "extraction","label": "خلع",       "minutes": 45 },
    { "id": "rootcanal", "label": "علاج عصب",  "minutes": 90 },
    { "id": "other",     "label": "أخرى",      "minutes": 30 }
  ],
  "reminders": {
    "enabled": true,
    "hoursBefore": 18,
    "sendWindow": { "from": "10:00", "to": "20:00" },
    "minLeadHours": 3,
    "catchUp": {
      "minGapMinutes": 5,
      "maxGapMinutes": 15,
      "maxMessages": 15
    },
    "template": "..."          // see §8
  },
  "whatsapp": {
    "sessionPath": "./session",
    "dryRun": false             // true = log instead of send. Use in dev.
  },
  "printing": {
    "driver": "pdf",              // "pdf" | "escpos" | "file" | "none"
    "printerName": "...",         // OS printer name; omit for default printer
    "escpos": { "interface": "printer:ClinicPrinter", "width": 42 }
  },
  "server": { "port": 8080, "host": "0.0.0.0" },
  "hostname": "mawid",          // used to build QR URLs — see §9
  "backups": {
    "local": "./backups",
    "external": "E:/mawid-backups",   // omit if none
    "offsite": { "enabled": false, "bucket": "...", "publicKey": "age1..." },
    "intervalHours": 6,
    "retention": { "daily": 14, "weekly": 8, "monthly": 12 }
  }
}
```

Appointment types and durations differ between the two clinics. So does reminder wording. All of it is config.

---

## 5. Schema

Defined in Drizzle schema files; the SQL below is the reference shape.

Times stored as **UTC ISO-8601 strings**. Convert to clinic timezone only for display and scheduling logic. Do not store local times — DST and timezone bugs in a booking system are miserable to debug.

### Drizzle notes

- **Migrations are committed to the repo** and applied automatically on boot. Two clinics run installs you can't easily reach — you must never be unsure which schema version a clinic is on.
- Log the applied migration version at startup and expose it on `/api/health`.
- Write the **overlap check by hand** in raw SQL (Drizzle allows this) rather than composing it through the query builder. It's the one hard correctness guarantee in the system and it should be obviously correct on reading.
- Do not use `drizzle-kit push` against a clinic install. Generate migrations, commit them, apply them.

```sql
CREATE TABLE patients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,            -- E.164, normalized on write: +20...
  notes       TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_name  ON patients(name);

CREATE TABLE appointments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ref            TEXT NOT NULL UNIQUE,   -- short human code, e.g. "M7K2Q" — printed on slip
  patient_id     INTEGER NOT NULL REFERENCES patients(id),
  starts_at      TEXT NOT NULL,          -- UTC ISO
  duration_min   INTEGER NOT NULL,
  type_id        TEXT NOT NULL,          -- matches config.appointmentTypes[].id
  note           TEXT,
  status         TEXT NOT NULL DEFAULT 'booked',
                 -- booked | done | cancelled | no_show
  channel        TEXT NOT NULL DEFAULT 'desk',   -- desk | whatsapp | phone
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_appt_starts ON appointments(starts_at);
CREATE INDEX idx_appt_patient ON appointments(patient_id);

CREATE TABLE reminders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id),
  status         TEXT NOT NULL,          -- pending | sent | failed | skipped
  scheduled_for  TEXT NOT NULL,          -- UTC ISO
  sent_at        TEXT,
  error          TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_rem_status ON reminders(status, scheduled_for);
```

`UNIQUE` on `reminders.appointment_id` is the guarantee a patient is never messaged twice for the same appointment. Rely on it rather than on application logic.

### Double-booking

Enforce in a transaction on insert: no other appointment with `status = 'booked'` may overlap `[starts_at, starts_at + duration_min)`. Reject with a clear error. This is the one hard correctness guarantee in the system.

---

## 6. API surface

All under `/api`, JSON in and out.

```
GET    /api/config                      → clinic name, hours, appointment types
GET    /api/appointments?date=YYYY-MM-DD
GET    /api/appointments/:id
POST   /api/appointments                → { patientId | {name, phone}, startsAt, typeId, note }
PATCH  /api/appointments/:id            → { startsAt?, typeId?, status?, note? }
DELETE /api/appointments/:id            → sets status = cancelled

GET    /api/slots?date=&typeId=         → open slots for that duration
GET    /api/patients?q=                 → search by name or phone
GET    /api/patients/:id                → patient + full appointment history
POST   /api/patients
PATCH  /api/patients/:id

POST   /api/print/slip/:appointmentId
POST   /api/print/day?date=YYYY-MM-DD
GET    /api/print/failures              → recent failures, for the desk banner
GET    /api/stats?from=&to=             → bookings, reminders sent, failures, no-shows

GET    /api/whatsapp/status             → { connected, qr?, lastError? }
POST   /api/whatsapp/logout
GET    /api/reminders?date=             → status per appointment

GET    /api/health                      → { ok, printer, whatsapp, db }
```

Non-API routes:

```
GET    /s/:ref        → QR target. Records scan, notifies desk, redirects to /p/:patientId
GET    /p/:patientId  → patient view (same SPA, phone-friendly)
WS     /ws            → live updates to the desk screen
```

### WebSocket events

```
appointment:created | appointment:updated
reminder:sent | reminder:failed
print:failed
whatsapp:status
scan            → { appointmentId, patientId }   // desk screen jumps to this patient
```

---

## 7. Printing

**The server runs on the clinic PC, so the server prints.** No browser involvement, no print dialog, nothing for the secretary to click. She books an appointment; paper comes out.

**The printer model at each clinic is unknown until install.** Do not assume thermal. Printing must be swappable by config, never by code change.

```ts
interface PrintDriver {
  name: string;
  available(): Promise<boolean>;
  print(job: PrintJob): Promise<void>;
}
```

### `pdf` — the production driver

Render the slip or schedule to PDF, then hand it to the OS print command.

- Windows: `SumatraPDF -print-to "PrinterName"` (bundle it — it's a single portable exe and far more reliable than PowerShell for this), or `Out-Printer` as a fallback
- Linux/macOS dev: `lp -d PrinterName`

Works with any printer Windows has installed — inkjet, laser, or thermal with a driver. No USB access, no driver swapping, and Arabic rendering is handled by the PDF renderer rather than printer firmware. **This is the default driver.**

### `escpos` — optional

Raw ESC/POS for thermal receipt printers, via `node-thermal-printer`, sent through the **installed Windows printer driver / spooler**. Do **not** use direct libusb access — it requires swapping the driver with Zadig, which is not acceptable on a client's machine.

Only worth building if a clinic specifically wants receipt-roll slips *and* Arabic renders correctly on that hardware. Test Arabic before committing to it.

### `file` — dev

Writes the PDF to a folder instead of printing. Use during development and as a manual escape hatch when a printer is misbehaving.

### Failure handling

No persistence. Everything printable is derivable from the appointment, so a print job is not state worth storing — "reprint" means render it again.

- In-memory queue with bounded retry (printer off, out of paper, spooler busy)
- On final failure: emit `print:failed` on the websocket and show a visible banner on the desk screen
- Keep the last few failures in memory for that banner
- Every printable thing has a reprint button in the UI — that's the recovery path for anything lost to a restart

A silent failure to print is worse than no printing. Loud is the requirement; durable is not.

### What gets printed

**Booking slip** — clinic name, patient name, phone, date, time, duration, type, ref code, QR code, and a blank `Booked: ______` line.

**Day schedule** — every appointment for the day in time order: time, patient name, phone, type. A wide blank column on the right for handwriting — the doctor writes on the schedule today and must be able to keep doing that. QR per row. Reprintable on demand.

**Stats** are not printed — bookings taken, reminders sent, delivery failures, and no-show count live on a screen in the UI. This is what you show the doctor to justify the fee; it just doesn't need to be paper.

Arabic text: RTL, and verify the chosen driver renders Arabic correctly. Thermal printers frequently mangle Arabic — **test this early**, it may be the deciding factor for the `html` driver in production.

---

## 8. WhatsApp (Baileys)

**Runs on a dedicated number, never the clinic's main line.** A restricted number must degrade to "reminders are late," not "patients can't reach the clinic."

- Session credentials persisted to `config.whatsapp.sessionPath` and included in backups. Losing them means re-scanning a QR at the clinic.
- Handle disconnects with automatic reconnect and backoff. The socket will drop.
- Expose connection state at `/api/whatsapp/status`, including the pairing QR when unlinked, so linking can be done from the desk UI.
- `dryRun: true` logs the message instead of sending. Use it for all development.

### Sending discipline

These exist to keep the number healthy, and are requirements, not suggestions:

- Send only to patients with a booked appointment
- **One reminder per appointment, ever** — enforced by the `UNIQUE` constraint
- Space messages out (a few seconds apart minimum); never send the day's batch in a burst
- Ramp up volume gradually on a new number rather than starting at full rate
- Only send inside `reminders.sendWindow`
- Identify the clinic clearly in every message
- ~~Include an opt-out line~~ — dropped from the template by decision. Worth
  revisiting if delivery failures or blocks appear: an opt-out costs nothing,
  and a spam report costs the number
- Alert if delivery failures spike; that's the early signal something is wrong

### Message template

Config-provided, with placeholders: `{patient}`, `{clinic}`, `{date}`, `{time}`, `{address}`, `{phone}`.

Arabic, Egyptian phrasing. Must include: who it's from, when the appointment is, where, how to cancel.

### Abstraction

All sending goes through a `MessageSender` interface with a Baileys implementation behind it. If the number gets restricted repeatedly, or a clinic grows enough to justify paid messaging, swapping to the official WhatsApp Cloud API should be a new implementation, not a rewrite.

---

## 9. Reminders & QR

### Reminder loop

### Scheduling a reminder

A reminder row is created when an appointment is booked:

```
scheduled_for = starts_at - reminders.hoursBefore
```

Then **snap it backwards to the nearest time the clinic is open**, using `config.hours` and `reminders.sendWindow`.

This is the rule that keeps everything else simple. Without it, a Monday 10am appointment schedules its reminder for Sunday afternoon when the clinic is closed and the PC is off — so it doesn't send, and arrives late Monday instead. Snapped backwards, it goes out Saturday afternoon while someone is there.

Get this right and the catch-up path below becomes a rare exception rather than a weekly event.

### Normal sending

An interval inside the server process (every ~60s) — **not** external cron. Baileys needs a persistent connection, so the process is long-running anyway.

Each tick: find `pending` reminders where `scheduled_for <= now`, apply the skip rules, send. A handful per day, a few seconds apart.

### Skip rules

Evaluated **immediately before each send**, never when the queue is built — during a slow drain a reminder can go stale while it waits.

| Condition | Action |
|---|---|
| Appointment already started | **skip** — a reminder for a past appointment makes the system look broken |
| Starts sooner than `minLeadHours` | **skip** — too late to be useful |
| Appointment cancelled | **skip** |
| Outside `sendWindow` | leave `pending`, retry next tick |
| Otherwise | **send**, even if late — 4 hours' notice still works |

Skipped reminders are marked `skipped` with a reason and **listed on the desk screen**: "these patients were not reminded." The secretary calls them. The manual fallback is the recovery path, so it has to be visible.

### Catch-up after downtime

The PC is not on 24/7. After it's been off, many reminders can be overdue at once. Sending them in a burst is exactly the pattern that gets a WhatsApp number restricted, so catch-up runs on different rules:

- **Spacing: 5–15 minutes between messages, randomized.** Fixed intervals look automated; jitter doesn't.
- **Order by appointment time, soonest first** — those are closest to becoming useless.
- **Re-check skip rules before each send** (see above).
- **Cap the drain at ~15 messages.** Beyond that, stop queueing and surface the rest on the desk screen as "call these patients." A ten-hour trickle isn't a recovery; a phone call is.

Two speeds, then: seconds apart in normal operation, 5–15 minutes apart when catching up. Only the catch-up sweep gets the long spacing, because only it produces a burst.

### QR codes

Encode `http://{hostname or LAN IP}:{port}/s/{ref}`.

- Resolve the host **at print time** from the actual network interface. Never hardcode.
- Prefer the configured hostname (`http://mawid:8080`) over a raw IP so previously printed pages survive a DHCP change. Fall back to the detected LAN IP.
- `/s/:ref` records the scan, emits `scan` on the websocket, and redirects to the patient page.

**The scan-follow behaviour is the demo's best moment:** scanning a printed slip with a phone makes the desk screen jump to that patient. Paper becomes a remote control for the system. Build it.

Phone and PC must be on the same wifi. Give the PC a static LAN IP or a DHCP reservation.

---

## 10. Monitoring & alerting (post-demo)

Two clinics means nobody will reliably tell you when something breaks. Not needed for the August demo — build after.

The problem to design around: **the failures worth hearing about are often ones where the reporting channel is also down.** If Baileys dies, alerting over WhatsApp dies with it. If the PC is off, silence and health look identical.

So, two independent channels:

**Alerts — Telegram bot.** One HTTPS POST to the Bot API. Free, trivial to set up, and independent of WhatsApp — which is the point, since a dead WhatsApp connection is the main thing to be alerted about. Send on: WhatsApp disconnected, reminder send failures, print failures, unhandled exceptions, DB errors.

**Heartbeat — UptimeRobot.** The app pings on a schedule; missed pings alert. This catches crashes and extended downtime, where by definition nothing else can report.

Since the clinic PC is **not on 24/7**, configure maintenance windows matching that clinic's closed hours from `config.hours`, so it only alerts when the PC should be on.

### Requirements

- **Scrub patient data.** Alerts leave the clinic to third-party services and this is medical data. Never send names, phone numbers, or notes — appointment IDs and error types only. Redact in the alert layer, by default, not at each call site.
- **Dedupe and rate-limit.** A reconnect loop firing every two seconds sends 1,800 alerts overnight and the channel gets muted, which defeats the purpose. Collapse repeats: one alert, a periodic summary while it persists, one message on recovery.
- **Tag the clinic name** from config on every alert, or you won't know whose printer is jammed.

**Daily digest:** bookings taken, reminders sent, failures, skipped reminders. Passive visibility without having to check anything.

---

## 11. Backups

Patient records and appointment history. Losing them is unrecoverable and would end the client relationship.

### What to back up

1. **The SQLite database**
2. **The Baileys session folder** — losing it stops reminders until someone physically scans a pairing QR at the clinic
3. **`config.json`** — small, and it's the clinic's whole setup

### How

**Use `VACUUM INTO '<path>'`.** Never copy the live database file — a plain copy during a write can produce a corrupt backup that appears valid until the day you need it. `VACUUM INTO` is one statement, safe on a live DB, and writes a consistent compacted file.

**Verify every backup** by opening the copy and running `PRAGMA integrity_check`. Discard and re-run on failure. An unverified backup is a guess.

### Where

Three destinations, increasing in distance:

| Destination | Purpose |
|---|---|
| Local folder on the PC | Fast restore from user error |
| USB stick or network drive | Survives disk failure |
| Off-site (object storage) | Survives fire, theft, ransomware |

### Off-site requires encryption

Off-site backups take **medical records out of the clinic**. Encrypt before upload — age or libsodium, key held by you, never stored on the clinic PC. This is non-negotiable and worth being able to state plainly to both doctors.

### When

The PC is not on 24/7, so **do not schedule by wall-clock time**. Run: on startup, then every N hours while running, and on clean shutdown.

### Retention

Keep ~14 daily, ~8 weekly, ~12 monthly. Prune automatically — an unbounded backup folder eventually fills the disk, which takes the whole system down.

### Restore

Write a documented restore procedure and **test it before either clinic goes live**. An untested backup is not a backup. Restoring should be: stop app, drop file in place, start app.

### Failure is loud

If a backup fails or hasn't succeeded in over 48 hours, alert (§10) and show a banner on the desk screen. Silent backup failure is the classic way to discover you have no backups at the worst possible moment.

### Paper is a real fallback

The printed day schedules are an offline record of every appointment. If everything digital is lost, the clinic still knows who is coming. Worth saying out loud to a doctor who wants everything physical — it's an argument his instinct already agrees with.

---

## 12. Desktop shell

**Not now.** For the demo, Edge's "Install this site as an app" gives a desktop icon and a chromeless window for zero code.

If a real shell is wanted later, **Tauri**: point a window at `http://localhost:8080`, ship the compiled Bun binary as a sidecar (`externalBin`), spawn it on start, wait for the port, kill it on close. No frontend changes — which is the entire reason for the relative-URL rule in §2.

---

## 13. Build order

Two days before the demo. One clean path, no branches.

**Day 1 — the system**
1. Monorepo scaffold + **`packages/shared` written first** — API types and Zod schemas for every endpoint in §6. Both sessions build against this.
2. Project scaffold per §3 — app/server split, middleware chain, `AppError`, response envelope, one module end-to-end as the template
3. Config loading and Zod validation
4. Drizzle schema + generated migrations, applied on boot
5. Static frontend serving, `/api/health`
6. Patients and appointments modules, with the overlap check + its tests
7. Booking screen: day view, open slots, book a patient
8. Patient page with history
9. `pdf` print driver (render → OS print command) + slip + day schedule
10. QR codes on printed output
11. `/s/:ref` + websocket + desk screen scan-follow

**Day 2 — WhatsApp and polish**
12. Baileys connection, session persistence, `/api/whatsapp/status`, QR pairing in the UI
13. Reminder scheduling and the send loop (`dryRun` first)
14. Live test to your own number
15. Failure banners on the desk screen
16. Arabic display and RTL check
17. Demo dry run, end to end, twice

### The demo path — this must work

1. Book an appointment on screen
2. Slip prints, with a QR code
3. WhatsApp reminder arrives on a phone
4. Scan the slip → patient opens on the phone, desk screen jumps to them

If time runs short, cut features — never cut a step of that path.

---

## 14. Deliberately deferred

Auth and login · editing/cancelling beyond the basics · no-show tracking UI · reply-to-confirm · settings screens · installer · backups UI · second reminder · patient notes/history beyond a list · ESC/POS thermal driver · Tauri shell · Telegram alerting and UptimeRobot heartbeat (§10) · daily digest.

---

## 15. Notes for whoever builds this

- **Fail loudly, everywhere.** Printer offline, WhatsApp disconnected, reminder failed — all must be visible on the desk screen. A silent failure in this system means a patient doesn't get told, and nobody finds out until they don't show up.
- **The secretary's screen must be faster than the paper book.** If booking takes more than a few taps she'll stop using it, and everything downstream goes stale.
- **The paper book stays in parallel during the pilot.** Don't design as if it's gone.
- **Two clinics, different everything** — hours, appointment types, durations, reminder wording, printers. If a clinic-specific value appears in source, it belongs in config.
