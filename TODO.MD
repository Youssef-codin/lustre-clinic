# TODO — server

Deferred deliberately, not forgotten. Ordered by what bites first.

## `GET /api/stats?from=&to=`

The last unbuilt endpoint in §6. Contract is already in `packages/shared/src/stats.ts`.

Inclusive range of **clinic-local** days, so both bounds go through
`clinicDayBounds()` rather than being compared as strings — `starts_at` is UTC
and a naive comparison drops the first and last few hours of the range.

Counts needed:

- `bookings` — appointments **created** in the range (`created_at`), whatever
  became of them since. Not `starts_at`.
- `cancelled`, `noShows` — by `status` over the same range.
- `remindersSent`, `remindersFailed`, `remindersSkipped` — by `reminders.status`.

This is the screen shown to the doctor to justify the fee, which is exactly why
§7 says it is never printed.

## CI (§3)

No `.github/` exists. Two path-filtered workflows, `server.yml` and `web.yml`,
both triggering on `shared/**` — a contract change has to be validated against
both sides. install → type-check → lint → test. No service containers needed.

## Backups (§11)

Nothing built. Note §14 defers the backups *UI*, not backups themselves, and
`config.backups` is already modelled and validated.

- `VACUUM INTO`, never a file copy — a copy taken mid-write produces a corrupt
  backup that looks valid until the day it is needed.
- Verify every one by opening it and running `PRAGMA integrity_check`.
- Back up the database, the Baileys session folder, and `config.json`.
- On startup, every N hours while running, and on clean shutdown — never on
  wall-clock time, because the clinic PC is not on 24/7.
- Prune to the retention in config; an unbounded folder eventually fills the
  disk and takes the whole system down.
- Loud on failure, or if nothing has succeeded in 48 hours.

## Smaller

- `seed` script (§3 lists one; it does not exist).
- `escpos` print driver — deferred in §14. `driverFor()` currently falls back to
  the file driver with a warning rather than silently printing nothing.
- Monitoring and alerting (§10) — explicitly post-demo.

## Needs hardware, not code

- Scan a printed slip with a real phone. QR geometry is verified against the
  matrix in tests, but nothing here can decode one.
- Pair a real WhatsApp number and send a live reminder (§13 item 14). Must be a
  dedicated number, never the clinic's main line.
