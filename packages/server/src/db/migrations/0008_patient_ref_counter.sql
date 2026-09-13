-- drizzle-kit emitted the column; the backfill is added by hand, like 0006.
--
-- Patient refs become plain numbers carried on from the clinic's own count
-- (§5). `patient_ref_last` is the last one handed out, and the patient insert
-- moves it on in the same transaction, so two registrations at once cannot
-- share a number. The clinic sets where it continues from in Settings → Clinic.
--
-- Existing patients keep the random four-character codes they were given. A
-- few of those are all digits (`2345`), and a counter that later reached one
-- would hand it out again, so the counter starts at the highest of them rather
-- than at zero.

ALTER TABLE "settings" ADD COLUMN "patient_ref_last" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

UPDATE "settings"
SET "patient_ref_last" = COALESCE(
    (SELECT max("ref"::bigint) FROM "patients" WHERE "ref" ~ '^[0-9]+$'),
    0
);
