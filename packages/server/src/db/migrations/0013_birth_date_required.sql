-- Hand-written, like 0006, 0008 and 0011, because the backfill has to run before
-- the constraint. Every patient now has an age. A record that came across
-- without one is put at 100 on 1 January, the same convention the app uses when
-- it turns a typed age into a date, so it reads as an obvious placeholder
-- rather than a plausible age somebody might believe.
--
-- Numbered 0013 on purpose: 0012 is `ref_edits` on another branch, and drizzle
-- skips a migration whose timestamp is older than the last one a database has
-- applied, so that one has to land first.
UPDATE "patients"
SET "birth_date" = make_date(extract(year FROM current_date)::int - 100, 1, 1)
WHERE "birth_date" IS NULL;
--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "birth_date" SET NOT NULL;
