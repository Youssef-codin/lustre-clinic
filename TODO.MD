# TODO

Deferred deliberately, not forgotten. Ordered by what bites first.

---

## Desk UI

Every endpoint below already exists and is tested. This is wiring, not backend.

- [ ] **Cancel an appointment** — `DELETE /api/appointments/:id`, called from nowhere.
- [ ] **Move to another time** — `PATCH /api/appointments/:id`; overlap check and reminder reschedule already handled.
- [ ] **Mark done / no-show** — same `PATCH`, `status`. Stats reports no-shows nobody can enter.
- [ ] **Edit an appointment note** — same `PATCH`, `note`.
- [ ] **Edit a patient** — `PATCH /api/patients/:id`. A wrong phone silently never gets reminded.
- [ ] **Reprint a slip** — `POST /api/print/slip/:id`, today only reachable as a failure retry.
- [ ] **Print the day schedule** — `POST /api/print/day`, same.
- [ ] **Stats screen** — needs the endpoint below.

---

## Server

- [ ] **`GET /api/stats?from=&to=`** — last unbuilt endpoint (§6). Contract in `shared/src/stats.ts`.
  - [ ] Both bounds through `clinicDayBounds()` — string compares drop hours off each end.
  - [ ] `bookings` off `created_at`, not `starts_at`.
  - [ ] `cancelled` / `noShows` by status; reminder counts by `reminders.status`.

- [ ] **Search by ref number** — the desk box takes name and phone only (`searchPatients`). A
      secretary holding a slip has to read the date off it and scroll the day. Ref lookup exists
      today only as `recordScan`, which is the wrong tool: it broadcasts a `scan` event to every
      screen and is meant for a phone hitting `/s/:ref`.
  - [ ] Detect a ref by shape — `/^\d{6}-\d{2,3}$/`, already in `shared/src/appointment.ts`.
  - [ ] On a ref match, go straight to that appointment's patient, not a name-match list.
  - [ ] Decide what the box returns — it is typed `PatientSummary[]`, and a ref identifies one
        *appointment*. Either widen the response or have the desk follow up with the detail call.
  - [ ] Do not broadcast. Only a real scan moves other people's screens.

- [ ] **Backups (§11)** — nothing built. Losing the Baileys session means re-pairing at the clinic.
  - [ ] `VACUUM INTO`, never a file copy.
  - [ ] Verify each with `PRAGMA integrity_check`.
  - [ ] Database, session folder, `config.json`.
  - [ ] On startup, every N hours, and on clean shutdown — not wall-clock.
  - [ ] Prune to the configured retention.
  - [ ] Loud on failure, or after 48 quiet hours.

- [ ] **CI (§3)** — no `.github/`. `server.yml` + `web.yml`, both on `shared/**`. Install → typecheck → lint → test.
- [ ] **`escpos` driver** — deferred (§14); falls back to the file driver with a warning.
- [ ] **Monitoring and alerting (§10)** — post-demo.

---

## Live WhatsApp

- [ ] **Ramp volume gradually** — §8 is a requirement. Code won't burst; real traffic still should stay light at first.
- [ ] **Watch delivery failures** — the early signal the number is in trouble. Overlaps with monitoring.

---

## Done

- [x] **WhatsApp / Baileys** — socket, session, scannable pairing QR, reconnect, `onWhatsApp` guard, desk test button. INTEGRATION.MD §10.
- [x] **Live pairing and send** — verified on a real handset.
- [x] **Scan a printed slip** — desk followed the scan on its own. Two bugs fixed to get there; INTEGRATION.MD §9.
- [x] **`seed` script** — `bun run seed [--reset]`, `bun run sample-print`. Points seeded patients at `whatsapp.testNumber` when sending is live.
