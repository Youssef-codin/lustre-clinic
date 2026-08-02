# TODO

Deferred deliberately, not forgotten. Ordered by what bites first.

---

## Desk UI — things the secretary cannot do yet

**Every endpoint below already exists and is tested.** Nothing here needs new
backend work except the stats screen; it is wiring, not building. The API was
finished ahead of the desk and these are the calls the desk never got around to
making.

- [ ] **Cancel an appointment.** `DELETE /api/appointments/:id`. Nothing in the
      web app calls it — `api.delete` is defined in `lib/api.ts` and used
      nowhere. Today a cancellation means editing the database by hand, and
      cancelling is the single most common thing a clinic does after booking.
- [ ] **Move an appointment to another time.** `PATCH /api/appointments/:id`
      with `startsAt` / `typeId`. Re-runs the overlap check and reschedules the
      pending reminder automatically (`rescheduleReminderFor`), so the hard part
      is done.
- [ ] **Mark done / no-show.** Same `PATCH`, `status` field —
      `booked | done | cancelled | no_show`. Note the no-show count is one of
      the numbers the stats screen is supposed to show the doctor, so without
      this that screen is reporting a figure nobody can enter.
- [ ] **Edit an appointment's note.** Same `PATCH`, `note` field.
- [ ] **Edit a patient — name, phone, notes.** `PATCH /api/patients/:id`.
      Correcting a mistyped phone number currently needs `curl`. A wrong number
      means that patient silently never gets reminded.
- [ ] **Reprint a slip.** `POST /api/print/slip/:appointmentId`. Booking
      auto-prints one, but a patient who loses theirs cannot be given another
      from the UI — the endpoint is reachable today *only* by retrying a
      failure in `PrintFailureBanner`.
- [ ] **Print the day schedule.** `POST /api/print/day`. Same story: renders
      correctly, only reachable as a failure retry.
- [ ] **Stats screen.** Needs the endpoint below built first.

---

## Server

- [ ] **`GET /api/stats?from=&to=`** — the last unbuilt endpoint in §6. Contract
      is already in `packages/shared/src/stats.ts`.

      Inclusive range of **clinic-local** days, so both bounds go through
      `clinicDayBounds()` rather than being compared as strings — `starts_at` is
      UTC and a naive comparison drops the first and last few hours of the range.

      - `bookings` — appointments **created** in the range (`created_at`),
        whatever became of them since. Not `starts_at`.
      - `cancelled`, `noShows` — by `status` over the same range.
      - `remindersSent` / `remindersFailed` / `remindersSkipped` — by
        `reminders.status`.

      This is the screen shown to the doctor to justify the fee, which is
      exactly why §7 says it is never printed.

- [ ] **Backups (§11).** Nothing built, and the stakes went up the day a real
      WhatsApp session started existing — losing it is not a file restore, it is
      someone standing in the clinic re-scanning a pairing QR. §14 defers the
      backups *UI*, not backups themselves, and `config.backups` is already
      modelled and validated.

      - [ ] `VACUUM INTO`, never a file copy — a copy taken mid-write produces a
            corrupt backup that looks valid until the day it is needed.
      - [ ] Verify every one by opening it and running `PRAGMA integrity_check`.
      - [ ] Back up the database, the Baileys session folder, and `config.json`.
      - [ ] On startup, every N hours while running, and on clean shutdown —
            never on wall-clock time, because the clinic PC is not on 24/7.
      - [ ] Prune to the retention in config; an unbounded folder eventually
            fills the disk and takes the whole system down.
      - [ ] Loud on failure, or if nothing has succeeded in 48 hours.

- [ ] **CI (§3).** No `.github/` exists. Two path-filtered workflows,
      `server.yml` and `web.yml`, both triggering on `shared/**` — a contract
      change has to be validated against both sides. install → type-check →
      lint → test. No service containers needed.

- [ ] **`escpos` print driver** — deferred in §14. `driverFor()` falls back to
      the file driver with a warning rather than silently printing nothing.

- [ ] **Monitoring and alerting (§10)** — explicitly post-demo.

---

## Live WhatsApp — operational, not code

- [x] Pair a real number and send a live message. Done — see INTEGRATION.MD §10.
- [ ] **Ramp volume up gradually.** §8 is a requirement, not advice: a new
      number that starts at full rate is a number that gets restricted. The
      catch-up path caps at 15 messages spaced 5–15 minutes, so the code will
      not burst on its own — but keep real traffic light for the first days.
- [ ] **Watch for delivery failures spiking.** That is the early signal the
      number is in trouble, and nothing surfaces it yet beyond individual rows
      on the desk. Overlaps with monitoring above.

---

## Done

- [x] **Scan a printed slip with a real phone.** A slip printed on the HP
      LaserJet was scanned and opened the patient's page; the desk followed the
      scan on its own. Two bugs had to be fixed to get there — INTEGRATION.MD §9.
- [x] **WhatsApp / Baileys.** Socket, session persistence, pairing QR rendered
      to a scannable image, reconnect with backoff, `onWhatsApp` guard against
      silent sends to numbers with no account, and a desk test button.
      INTEGRATION.MD §10.
- [x] **`seed` script** (§3) — `bun run seed` / `bun run seed --reset`, plus
      `bun run sample-print` which renders the slip and the day schedule to
      `docs/`. Points every seeded patient at `whatsapp.testNumber` when sending
      is live, so re-seeding cannot message strangers.
