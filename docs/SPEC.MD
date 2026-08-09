# Mawid — Technical Spec

Clinic management app. React Native client, on-prem server, Tailscale-only network.

---

## 1. Architecture

```
┌─────────────┐         ┌─────────────┐
│  RN app     │         │  RN app     │
│  secretary  │         │  doctor     │
└──────┬──────┘         └──────┬──────┘
       │                       │
       └────── Tailscale ──────┘
                   │
       ┌───────────▼───────────┐
       │  Clinic PC (Debian)   │
       │  ┌─────────────────┐  │
       │  │ Bun + tRPC      │  │
       │  ├─────────────────┤  │
       │  │ GlitchTip       │  │
       │  ├─────────────────┤  │
       │  │ PostgreSQL 17   │  │
       │  └─────────────────┘  │
       │  docker compose       │
       └───────────────────────┘
```

No public ingress, no TLS termination, no reverse proxy. Tailscale is the transport and the security boundary. MagicDNS provides a stable hostname.

**No authentication.** Reachability on the tailnet is the authorization model. Role is a client-side preference (§6), not a permission.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Client | React Native (Expo) |
| Runtime | **Bun** |
| API | **tRPC v11** via the fetch adapter on `Bun.serve` |
| Client data | TanStack Query (via tRPC React Query bindings) |
| DB | PostgreSQL 17 |
| ORM | Drizzle + drizzle-kit, over `postgres.js` |
| Validation | Zod |
| Logging | pino |
| Client error tracking | GlitchTip (self-hosted), via `@sentry/react-native` |
| Transport | Tailscale + MagicDNS |
| Host | Debian stable, Docker Compose (`oven/bun` image) |
| Tests | `bun:test` |
| Lint | Biome — 4-space, single quotes, 110 width |

No HTTP framework. `Bun.serve` hosts the tRPC fetch adapter, native WebSockets, and APK downloads. No Express, no `ws` dependency.

**Driver note:** Drizzle runs over `postgres.js`, which is stable on Bun and the documented default. Bun's native `Bun.sql` + `drizzle-orm/bun-sql` is the newer alternative — verify maturity before choosing it over `postgres.js`.

---

## 3. Monorepo

```
mawid/
├── packages/
│   ├── shared/       # types + zod schemas — the contract
│   ├── server/
│   └── app/
├── compose.yaml
└── SPEC.md
```

`packages/shared` holds what tRPC inference **can't** provide: the `ERROR_CODE` enum, domain enums (status, payment method, question kind), constants, i18n dictionaries, and any Zod schema used by both sides.

Request and response types are **not** written here — they flow from `AppRouter`'s inferred type. The app imports `type { AppRouter }` from the server package; that is the contract.

Neither package edits the other. Contract changes land on main; worktrees rebase.

---

## 4. Backend structure

```
packages/server/src/
├── index.ts                    # entrypoint: migrate → background services → listen
├── modules/
│   ├── patient/
│   │   ├── patient.router.ts
│   │   ├── patient.schema.ts
│   │   └── patient.service.ts
│   ├── appointment/            # includes walk-ins
│   ├── visit/                  # check-in, procedures, pricing, checkout
│   ├── balance/                # outstanding balances, charged vs collected
│   ├── procedure/
│   ├── branch/
│   ├── customQuestion/
│   ├── reminder/
│   ├── settings/
│   ├── stats/
│   └── health/
├── trpc/
│   ├── init.ts                 # initTRPC, context, errorFormatter
│   └── router.ts               # appRouter — merges every module router
├── background/                 # not request-driven
│   ├── reminder.job.ts
│   └── backup.job.ts
├── errors/AppError.ts
├── db/                         # schema.ts · index.ts · migrations/
├── ws/                         # native Bun websocket handlers
└── util/                       # time · money · ref
```

### Module pattern

Every domain is a folder of three files:

```
modules/<name>/
  <name>.router.ts     # tRPC procedures; input schema → service call
  <name>.schema.ts     # Zod input schemas
  <name>.service.ts    # business logic + db; throws AppError
```

```ts
// modules/appointment/appointment.router.ts — thin
export const appointmentRouter = router({
    byDate: publicProcedure
        .input(byDateInput)
        .query(({ input }) => appointmentService.byDate(input)),

    create: publicProcedure
        .input(createAppointmentInput)
        .mutation(({ input }) => appointmentService.create(input)),
});
```

- **Routers are thin.** Input schema, call a service, return. No logic and no database access.
- **Services hold all business logic.** Plain arguments in, domain objects out, `AppError` thrown on failure. Services do not import tRPC.
- **Schemas live in `<name>.schema.ts`.** If the client needs one, it moves to `packages/shared` and both import it.
- **Routers are merged in `trpc/router.ts`.** That file does nothing else.
- **A module may import another module's service**, never its router. Cross-module logic goes in the service layer.
- **`background/` holds anything not request-driven** — the reminder job, backups. These import services; nothing imports them.

`AppRouter` is exported as a **type only** and consumed by the client. This is the API contract and is not hand-written.

### Context

Minimal: `{ db }`. No auth (§1), so no session or user on the context.

### Errors

Services throw `AppError { code, message, httpStatus }`. An `errorFormatter` in `trpc/init.ts` maps it onto `TRPCError`, carrying the app code through `shape.data.appCode`.

`ERROR_CODE` is an enum in `packages/shared`. The client switches on the code and localizes from it; it never parses messages. Server messages stay English for logs.

### Transport

`Bun.serve` is the entire HTTP layer. tRPC is mounted via `fetchRequestHandler` at `/trpc`; WebSocket upgrades and APK downloads are handled in the same `fetch`.

```ts
Bun.serve({
    port: 3000,
    fetch(req, server) {
        if (server.upgrade(req)) return;              // /ws
        const url = new URL(req.url);
        if (url.pathname.startsWith('/trpc')) {
            return fetchRequestHandler({
                endpoint: '/trpc',
                req,
                router: appRouter,
                createContext,
            });
        }
        return new Response('Not found', { status: 404 });
    },
    websocket: wsHandlers,
});
```

**Batching enabled.**

### Logging

pino. Do not log patient names, phone numbers, notes, or amounts. IDs only.

---

## 5. Schema

Postgres. Timestamps `timestamptz`. Money **integer piastres** — never floats. IDs **UUIDv7**.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE branches (
  id      UUID PRIMARY KEY,
  name    TEXT NOT NULL,
  address TEXT,
  active  BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE patients (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,               -- E.164, normalized on write
  email      TEXT,
  birth_date DATE,                        -- age derived, never stored
  gender     TEXT,
  custom     JSONB NOT NULL DEFAULT '{}', -- answers keyed by custom_questions.key
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON patients (phone);
CREATE INDEX ON patients USING gin (to_tsvector('simple', name));

CREATE TABLE procedure_types (
  id            UUID PRIMARY KEY,
  parent_id     UUID REFERENCES procedure_types(id),  -- null = category root
  name          TEXT NOT NULL,
  default_price INTEGER NOT NULL,
  has_quantity  BOOLEAN NOT NULL DEFAULT false,
  is_tooth_specific BOOLEAN NOT NULL DEFAULT false,  -- lines must name a tooth
  is_checkup    BOOLEAN NOT NULL DEFAULT false,
  active        BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE appointments (
  id           UUID PRIMARY KEY,
  ref          TEXT NOT NULL UNIQUE,      -- DDMMYY-XXXX
  patient_id   UUID NOT NULL REFERENCES patients(id),
  branch_id    UUID NOT NULL REFERENCES branches(id),
  starts_at    TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,        -- length of the appointment
  type_id      UUID REFERENCES procedure_types(id),
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'booked',
               -- booked | checked_in | awaiting_payment | done | cancelled | no_show
               -- awaiting_payment is optional and does not hold the slot (§7)
  channel      TEXT NOT NULL DEFAULT 'desk',   -- desk | walk_in
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  EXCLUDE USING gist (
    tstzrange(starts_at, starts_at + (duration_minutes || ' minutes')::interval) WITH &&
  ) WHERE (status IN ('booked','checked_in'))
);
CREATE INDEX ON appointments (starts_at);   -- day view queries a date range
CREATE INDEX ON appointments (patient_id);

CREATE TABLE visits (
  id             UUID PRIMARY KEY,
  appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id),
  checked_in_at  TIMESTAMPTZ NOT NULL,
  priced_at      TIMESTAMPTZ,             -- when charged_total was set, if before checkout
  completed_at   TIMESTAMPTZ,             -- checked out
  computed_total INTEGER NOT NULL DEFAULT 0,   -- from procedures + rules
  charged_total  INTEGER NOT NULL DEFAULT 0,   -- what the patient owes
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id          UUID PRIMARY KEY,
  visit_id    UUID NOT NULL REFERENCES visits(id),
  amount      INTEGER NOT NULL,          -- piastres, always positive
  method      TEXT NOT NULL,              -- cash | visa | instapay | other
  method_note TEXT,                       -- required when method = 'other'
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON payments (visit_id);

CREATE TABLE visit_procedures (
  id           UUID PRIMARY KEY,
  visit_id     UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  procedure_id UUID NOT NULL REFERENCES procedure_types(id),
  quantity     INTEGER NOT NULL DEFAULT 1,
  unit_price   INTEGER NOT NULL,          -- snapshot
  tooth        TEXT,                      -- e.g. 'UL6'; null when not tooth-specific
  note         TEXT
);

CREATE TABLE custom_questions (
  id         UUID PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,        -- stable key into patients.custom
  label      TEXT NOT NULL,
  kind       TEXT NOT NULL,               -- text | number | boolean | select
  options    JSONB,
  required   BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE reminders (
  id             UUID PRIMARY KEY,
  appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id),
  due_at         TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | skipped
  sent_at        TIMESTAMPTZ
);
CREATE INDEX ON reminders (status, due_at);

CREATE TABLE settings (
  id                  INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  clinic_name         TEXT NOT NULL,
  clinic_phone        TEXT,
  duration_options    INTEGER[] NOT NULL DEFAULT '{10,20,30,45}',
  default_duration    INTEGER NOT NULL DEFAULT 30,
  reminder_lead_hours INTEGER NOT NULL DEFAULT 24,
  reminder_notify_at       TIME NOT NULL DEFAULT '19:00',
  reminder_repeat_minutes  INTEGER NOT NULL DEFAULT 30,
  reminder_dismissed_on    DATE,           -- see §11: repeat is suppressed while this = today
  reminder_template   TEXT NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Appointments vs visits

An **appointment** is scheduled. A **visit** is what happened.

Cancelled and no-show appointments have no visit. `visits` is created at check-in and holds procedures, totals, and payments. One appointment has at most one visit (`UNIQUE` on `appointment_id`). A walk-in creates both in one transaction.

### Payment methods

Fixed enum: `cash | visa | instapay | other`. Not configurable. `method_note` carries detail when `other` is used.

### Constraints and invariants

**`EXCLUDE USING gist` prevents double-booking.** Enforced by Postgres, not application code. Requires `btree_gist`.

Test cases: identical start, one ending exactly when the next begins, fully contained, spanning, and that cancelled and no-show rows are excluded.

**Branch is not part of the exclusion.** One practitioner.

**`ref`** — `DDMMYY-XXXX`, day first. Four random characters, unique within the date. The alphabet excludes `0/O` and `1/I/L`. Stored uppercase, matched case-insensitively.

**Procedure hierarchy** — one level of nesting. A row with children is a category and is not selectable; only leaf rows are. Enforced in the service layer.

**Price snapshotting** — `visit_procedures.unit_price` is copied at write time. Line total is `unit_price × quantity`.

**`has_quantity` false** ⇒ that procedure may appear at most once per visit *per tooth*. An extraction on `UL6` and one on `UR3` are two lines; two extraction lines on `UL6`, or two lines of the same non-tooth-specific procedure, are rejected as `PROCEDURE_DUPLICATE`. Enforced in the service layer.

**Tooth notation** — Palmer. Quadrant (`UR | UL | LL | LR`) then position: `1`–`8` outwards from the central incisor for permanent teeth, `A`–`E` for primary. `UL6` is the upper-left first molar. The full set is `TEETH` in `@mawid/shared`; the client renders it as a searchable dropdown, so `tooth` is never free text.

**`is_tooth_specific`** decides whether a tooth belongs on the line, and the two cases are symmetric. A tooth-specific procedure with no tooth is `TOOTH_REQUIRED`; a tooth on a procedure that is not tooth-specific is `TOOTH_NOT_APPLICABLE`. Both are 422, enforced in the service layer. The flag is also what tells the client whether to show the tooth dropdown at all.

**Age** derived from `birth_date` at read time.

**`settings`** is a single enforced row.

---

## 6. Client roles

On first launch: Tailscale onboarding → server reachability check → role selection. Stored locally, switchable at any time.

| Secretary | Doctor |
|---|---|
| Day view (default landing) | Today (default landing) |
| Book / move / cancel | Patient history |
| Check-in | Finance |
| Finance page | Missed appointments |
| Reminder list | Stats |
| Patient records | Settings |

Not a permission boundary; either role can switch. Settings appear under the doctor view only.

---

## 7. Appointments

**Duration** — picker from `settings.duration_options`, default `settings.default_duration`. Not derived from the procedure type.

**Day view** — one branch, one day. Booked slots render patient name and procedure; gaps are tappable.

**Walk-ins.** `appointment.walkIn` takes a patient (existing or inline), a duration, and a branch. It sets `starts_at` to now, `channel = 'walk_in'`, and returns a checked-in visit.

Walk-ins are subject to the same overlap constraint.

**Missed appointments** — `status = 'booked'` past `starts_at + duration_minutes`. Listed for manual resolution to `no_show` or reschedule. Not transitioned automatically.

**Status transitions**

```
booked ──► checked_in ──► awaiting_payment ──► done
   │             └──────────────────────────────►┘
   ├──► cancelled
   └──► no_show
```

`checked_in` creates the `visits` row. `done` is set at checkout.

`awaiting_payment` is optional. The doctor sets it when he is finished and the
patient goes to the desk to settle up; the secretary then checks them out.
Checkout accepts `checked_in` or `awaiting_payment`, so a walk-in or a quick
checkup still goes straight to `done`.

An `awaiting_payment` appointment does **not** hold its slot — the patient has
left the chair, so the exclusion constraint stays `('booked','checked_in')`.

`awaiting_payment` is not an unpaid status: it says where the patient is, not
what they owe. Balance is derived (§10).

---

## 8. Visit flow

```
CHECK IN            patient has arrived
                    → appointment.status: checked_in
                    → visits row created
                    → checkup procedure line seeded automatically
                          ↓
(procedures and price may be set at any point from here)
                          ↓
BOOK NEXT           optional, inline
                          ↓
AWAITING PAYMENT    optional — the doctor is done, the patient owes at the desk
                    → appointment.status: awaiting_payment
                          ↓
CHECK OUT           amount confirmed and editable here
                    → charged_total set
                    → payments row created
                    → appointment.status: done
```

**Check-in seeds the checkup line.** The visit is created with the `is_checkup` procedure already added, so the default total is the checkup price. Adding any other procedure removes it from the total (§9). The line stays on the visit.

**Pricing is not required before checkout.** `visit.setProcedures` and `visit.setPrice` are optional and may be called at any time, in any order. Checkout always allows editing the charged amount: prefilled if already set, entered directly if not.

Procedure detail is often entered after the visit, so checkout does not depend on it.

`paid` may be zero, partial, or full. See §10.

---

## 9. Pricing

```
computed_total = Σ (unit_price × quantity)
                 minus checkup lines, if any non-checkup line exists
```

The checkup waiver is the only automatic pricing rule. The checkup line is seeded at check-in (§8).

Example, checkup at 300:

| Lines on the visit | `computed_total` |
|---|---|
| checkup | 300 |
| checkup + root canal (2700) | 2700 |
| checkup + crown (4200) + restoration (1500) | 5700 |

The checkup line is never deleted, only excluded from the sum.

- `computed_total` — rule output from the entered procedures. Never edited.
- `charged_total` — what the patient owes. Defaults to computed, editable at any point including checkout. The difference is the discount.
- **Payments are rows in `payments`**, not a field. A visit may have zero, one, or several.

**Discounts apply to the total only.** No per-line discounts.

**Money is integer piastres throughout.** Parse at the boundary, format at the display layer. No floats and no decimal types anywhere.

---

## 10. Balances

An outstanding balance is **derived, never stored**:

```sql
balance = visits.charged_total - COALESCE(SUM(payments.amount), 0)
```

A visit with no payment rows has a balance equal to `charged_total`. There is no unpaid status; a payment is a row, not a state transition.

### The balances screen

- **Total outstanding** across all patients
- **Patients with a balance** — name, amount owed, age of the oldest unpaid visit
- Tapping through shows that patient's visits with balances
- **Charged vs collected** for a selected period, with the difference

Balances are aggregated **per patient** across visits.

`visit.recordPayment` appends to `payments` against a visit. It does not edit `charged_total`.

---

## 11. Reminders

No automated sending.

- A `reminders` row is created on booking, `due_at = starts_at - settings.reminder_lead_hours`
- The reminder screen lists pending reminders; each row deep-links to WhatsApp
- Sending marks `sent`; the user can mark `skipped`

### Notification behaviour

A push notification fires daily at `settings.reminder_notify_at` (default 19:00) if any reminders are pending.

It repeats every `settings.reminder_repeat_minutes` (default 30) while reminders remain pending. Two ways to stop it:

- **Clear the list** — every reminder marked `sent` or `skipped`
- **Dismiss for today** — sets `settings.reminder_dismissed_on` to today; the repeat is suppressed while that equals the current date

The repeat stops at end of day and does not run overnight.

**WhatsApp deep link:** `https://wa.me/<E164 without +>?text=<uriencoded>` via `Linking.openURL`. Template from `settings.reminder_template`. Delivery confirmation is not available, so no logic may depend on whether the message was sent.

---

## 12. Settings

Everything configurable is a database row edited in-app, not a config file.

- Procedure types and subtypes — name, price, `has_quantity`, `is_checkup`, order, active
- Branches
- Custom questions
- Duration options and default
- Reminder lead time, notification time, repeat interval, message template
- Clinic name and phone

`.env` holds only non-user-editable values: `DATABASE_URL`, Discord webhook URL, backup encryption key.

---

## 13. API surface

tRPC router tree, mounted at `/trpc`. `q` = query, `m` = mutation.

```
health.check                q  → { ok, db, migration }

settings.get                q
settings.update             m

branch.list                 q
branch.create               m
branch.update               m

procedure.tree              q  → categories with leaves nested
procedure.create            m
procedure.update            m

patient.search              q  ({ q })
patient.byId                q  → { patient, visits, questionnaireGaps }  — one payload
patient.create              m
patient.update              m

customQuestion.list         q
customQuestion.create       m
customQuestion.update       m

appointment.byDate          q  ({ date, branchId }) → rows embed { patient }
appointment.byId            q
appointment.missed          q
appointment.create          m  → discriminated union on patient
appointment.walkIn          m  → creates + checks in, starts_at = now
appointment.update          m
appointment.cancel          m  → status: cancelled
appointment.awaitPayment    m  → status: awaiting_payment, from checked_in only

visit.checkIn               m  ({ appointmentId })
visit.byId                  q
visit.setProcedures         m  ({ visitId, procedures })      — optional, any time
visit.setPrice              m  ({ visitId, chargedTotal })     — optional, any time
visit.checkOut              m  ({ visitId, chargedTotal, paidTotal, method, methodNote })
visit.recordPayment         m  ({ visitId, amount, method })   — later payment against a balance

balance.outstanding         q  → patients with a balance, plus the total
balance.byPatient           q  ({ patientId }) → visits with a balance
balance.summary             q  ({ from, to }) → charged, collected, outstanding

reminder.pending            q
reminder.markSent           m
reminder.markSkipped        m
reminder.dismissToday       m  → silences the repeat until tomorrow

stats.summary               q  ({ from, to, branchId })
```

### Input notes

**`appointment.create`** takes a Zod discriminated union on the patient field: `{ kind: 'existing', patientId }` or `{ kind: 'new', name, phone }`. The second creates the patient in the same transaction.

**`appointment.byDate`** embeds `{ id, name, phone }` per row.

**`patient.byId`** returns patient and visit history in one payload, plus `questionnaireGaps`: the active custom questions this record is `unanswered` for, or whose stored answer is `answer_no_longer_valid` because the question narrowed since. Custom answers are validated against the questionnaire as it stood when they were given, never as it stands now, so editing a patient is never blocked by a question added or changed since they registered — `questionnaireGaps` is how the records screen knows what is left to ask.

**`visit.setProcedures`** replaces the full procedure list; it does not patch individual lines.

**`visit.setPrice`** and **`visit.setProcedures`** are optional and unordered.

**`visit.checkOut`** takes `chargedTotal` as well as the payment, and completes the visit regardless of the amount paid.

**`visit.recordPayment`** appends to `payments` for a payment made after checkout.

### WebSocket `/ws`

Native Bun WebSockets, upgraded in the same `fetch` handler. Kept separate from tRPC: with two clients and low volume, tRPC subscriptions are not required.

```
appointment:created | appointment:updated
visit:updated
settings:updated
```

---

## 14. Client behaviour

**Offline** — the server is unreachable during power cuts and reboots.

- Cache today's and tomorrow's schedule locally; render read-only when offline
- Show an offline banner
- **Do not queue writes.** Fail the write, show the error, let the user retry.

**Connection** — the client tries two addresses in order and uses whichever answers first:

1. **LAN address**, when the phone is on the clinic wifi — direct, no relay
2. **Tailscale MagicDNS hostname** — works from anywhere

Probe `health.check` on both, ~500ms timeout on the LAN attempt. Cache the result for the session; re-probe on network change.

Both addresses are configured during onboarding.

**Localization** — English primary, Arabic supported. Text direction derives from the locale; the layout must mirror. Errors localize by `ERROR_CODE`, not by server message text.

**Money** — format at the display layer only.

---

## 15. Deployment

Docker Compose on Debian: server + postgres 17 + GlitchTip (web, worker, redis) per §17.

- Systemd, `Restart=always`, for Docker and Tailscale
- BIOS auto-power-on after outage
- `unattended-upgrades` limited to security patches
- UPS recommended
- Replace a mechanical disk with an SSD before install

### Updates

Expo EAS Update for over-the-air JavaScript updates. Native changes require a new APK. APKs can be served from the clinic machine over the tailnet.

Every publish uploads source maps for the new `dist` (§17). An update that skips this ships crash reports nobody can read.

---

## 16. Backups

- `pg_dump` on a schedule inside the compose stack
- Verify each dump by restoring it into a scratch database
- Two destinations: local disk, off-site object storage
- Encrypt before off-site upload (age or libsodium). The key is not stored on the clinic machine
- Retention ~14 daily / 8 weekly / 12 monthly, pruned automatically
- Test the restore procedure before go-live
- Alert on failure and on no successful backup in 48h

---

## 17. Monitoring

Three channels, covering different failures. Two watch the server, one watches the client.

**Discord webhook** — the server reporting its own errors: backup failed, database error, unhandled exception. One POST to a webhook URL; no bot to register. One channel per clinic.

**UptimeRobot heartbeat** — external check that the machine is responding. Catches power cuts, crashes, and network failure, which the server cannot report itself.

- Alerts carry IDs and error codes only, never patient data
- Deduplicate and rate-limit

### Client errors — GlitchTip

A crash on a phone leaves no trace on the server. The secretary reports "it closed", and there is nothing to read. Client error tracking exists to turn that into a stack trace.

**GlitchTip runs on the clinic PC**, in the same compose stack as everything else. It speaks the Sentry protocol, so the app uses the standard `@sentry/react-native` SDK and its Expo config plugin — no Sentry account, no data leaving the machine, no third party holding crash reports from a medical app. `sentry-expo` is dead; do not install it.

```
Expo app ──@sentry/react-native──> Tailscale ──> GlitchTip ──> PostgreSQL 17
```

**Deployment** (§15) — additional compose services: the GlitchTip web process, its worker, and Redis for the queue. It gets its own database on the existing Postgres 17 container, separate from `mawid`; backups (§16) cover `mawid` only, since crash reports are disposable. Published on the Tailscale interface like the API. Open registration is disabled once the first account exists.

**DSN** — points at the **MagicDNS hostname**, never the LAN address. The DSN is baked into the build, so it has to resolve from anywhere on the tailnet; §14's two-address probe applies to the API only. A missing or empty DSN disables reporting and must not crash the app — that is the state every dev machine is in.

**What is reported**

- Unhandled JS exceptions and native crashes
- Unhandled promise rejections
- Transport failures and `INTERNAL`-class tRPC errors

**What is not.** Expected domain failures are outcomes, not incidents. A double-booking conflict, a validation rejection, a checkout that fails because the balance moved — those are `ERROR_CODE`s the UI already localizes (§14), and sending them turns the issue feed into noise. Filter on the code, not on the message.

**Never send patient data.** Same rule as pino and Discord alerts, and harder to hold here, because SDKs collect by default:

- `sendDefaultPii: false`
- No session replay, no screenshots, no view-hierarchy capture
- `beforeSend` **allow-lists** what leaves the device — procedure name, `ERROR_CODE`, IDs, app version. It does not attempt to strip names, phone numbers, notes, or amounts out of a payload; anything not on the list is dropped
- Breadcrumbs are limited to navigation events and tRPC procedure names. Console breadcrumbs are off — a stray `console.log` of a patient object would otherwise ship
- The role preference (§6) is a fine tag. There is no user identity to send; there is no auth (§1)

**Tags** — `ERROR_CODE`, procedure name, role, app version, `release`, `dist`.

**Offline** — GlitchTip is on the machine that goes down during a power cut, so it is unreachable exactly when the API is (§14). The SDK caches envelopes on disk and flushes them when the tailnet returns. Reporting never blocks the UI and never gates a retry.

**This channel cannot report that the clinic PC is down** — the client has nowhere to send that. The heartbeat covers it. The three channels are deliberately not redundant.

**Source maps** — release bundles are minified, and an unmapped React Native stack trace is worthless. `sentry-cli` uploads against GlitchTip's URL. There are two upload points: the EAS build, and **every EAS Update publish** (§15) — an OTA bundle is a new `dist` and needs its own upload, or traces silently degrade to hex offsets while everything still appears to work. Verify source-map handling against the deployed GlitchTip version before depending on it; it has historically lagged Sentry's.

**Sampling** — errors at 100%. This is two phones, not a public app. Tracing stays off: GlitchTip's performance support is thinner than its error support, and latency is not the problem this deployment has.

The server keeps Discord and the heartbeat. Pointing a Bun Sentry SDK at the same GlitchTip instance is possible later; it is not in scope here.

---

## 18. Build order

Two agents work in parallel: **B** on `packages/server`, **F** on `packages/app`. Neither edits the other's package. `packages/shared` changes land on main and both rebase.

### Phase 0 — sequential, before either agent starts

| # | Work |
|---|---|
| 0.1 | Monorepo scaffold — `packages/{shared,server,app}`, Biome, tsconfig, compose.yaml |
| 0.2 | `packages/shared` — `ERROR_CODE`, domain enums (status, channel, payment method, question kind), constants |
| 0.3 | Drizzle schema per §5 + migrations; `btree_gist`; `EXCLUDE` constraint **with boundary tests** |
| 0.4 | `Bun.serve` + tRPC init, context, errorFormatter; `health.check` returning green |

Phase 0 is the fork point. Both agents need the schema and a working `AppRouter` type to build against.

**The design system is done separately**, directly after the scaffold and before Phase 2 screens begin. Tokens, type scale, and shared components are settled by hand rather than generated as a build step, and everything in Phase 2 builds on the result.

### Phase 1 — parallel

| # | B — server | # | F — app |
|---|---|---|---|
| B1 | Monitoring (§17) — Discord webhook, heartbeat, GlitchTip compose services | F1 | App shell — Tailscale + LAN onboarding, connection probing (§14) |
| B2 | Backups (§16) — including a tested restore | F2 | tRPC client wiring, TanStack Query setup |
| B3 | `settings` module + seed row | F3 | Role selection, navigation, offline banner |
| B4 | `branch`, `procedure` modules | F4 | Localization scaffold — dictionaries, direction |
| B5 | `patient`, `customQuestion` modules | F5 | Client error tracking (§17) — Sentry SDK, DSN config, `beforeSend` allow-list |
| B6 | `appointment` module, including walk-ins | | |
| B7 | `visit` module — check-in, procedures, pricing, checkout | | |
| B8 | `balance` module | | |
| B9 | `reminder` module | | |
| B10 | `stats` module | | |

B1 and B2 come before feature work.

F runs against **mocked tRPC responses** until B has shipped the matching module. Mocks are typed from `AppRouter`, so they cannot drift from the real shape.

### Phase 2 — screens, F-led, each unblocked by its B module

| # | Screen | Needs |
|---|---|---|
| 1 | Day view — book, move, cancel, walk-in | B6 |
| 2 | Patient records + custom questions | B5 |
| 3 | Check-in, with the checkup line seeded | B7 |
| 4 | Finance page — procedures, quantities, totals | B7 |
| 5 | Checkout — charged amount editable, payment recorded | B7 |
| 6 | Book-next inline at checkout | B6, B7 |
| 7 | Balances screen | B8 |
| 8 | Missed appointments | B6 |
| 9 | Reminder list + WhatsApp deep link | B9 |
| 10 | Repeating notification + dismiss-for-today | B9 |
| 11 | Doctor view — today, history, balances, stats | B8, B10 |
| 12 | Settings screens | B3, B4 |

### Phase 3 — sequential

| # | Work |
|---|---|
| 3.1 | End-to-end pass on a real device against the real server |
| 3.2 | Arabic and RTL check across every screen |
| 3.3 | EAS Update wiring, including source-map upload to GlitchTip (§17) |
| 3.4 | Deployment (§15) — clinic PC, Docker, Tailscale, systemd, BIOS auto-power-on |

### Coordination rules

- **Contract changes go on main**, never in a worktree. Both agents rebase.
- If F needs a shape B hasn't built, F stops and reports it rather than editing `shared` or the server.
- B commits each module as it lands so F can drop the mock and use the real endpoint.
- Neither agent starts Phase 3.

---

## 19. Planned — v2

### Patient intake on a tablet

A tablet running the app in kiosk mode, handed to a new patient to complete the questionnaire themselves. The secretary then copies to paper.

`custom_questions` defines the form and answers go to `patients.custom`, so the schema exists. What's needed:

**Kiosk mode** — a third client role showing only the intake form. Unlike §6 this is a real boundary: a PIN is required to exit and no other screen is reachable.

**A pending-submissions queue** — submissions land in a queue for the secretary to review and confirm rather than creating a patient directly.

**Network** — the tablet needs to reach the server. Decide the approach before buying hardware.

---
