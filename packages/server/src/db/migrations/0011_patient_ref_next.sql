-- Hand-written, like 0006 and 0008, because the backfill is the point and
-- because drizzle-kit cannot tell a renamed column from a dropped one without
-- being asked at a prompt. No snapshot is emitted for it, as for those two;
-- the next interactive `bun db:generate` answers "renamed" and brings
-- `meta/` back in line.
--
-- `patient_ref_last` was the last number handed out, so a clinic typing 910
-- into Settings got 911 on the next registration — which is not what "the
-- patient number to carry on from" means to anyone reading the field. The
-- column is now `patient_ref_next`: the number the next *new* patient is given,
-- handed out as it stands and then moved on. Existing rows are +1 so the next
-- registration is handed exactly the number it would have been handed before.
--
-- `is_imported` and `date_unknown` are the same device `is_opening_balance`
-- already is: work the old system recorded, kept out of everything that counts.
-- `date_unknown` implies `is_imported`, checked rather than assumed, because
-- `starts_at` is NOT NULL and an ordinary appointment's date is always real.
--
-- The migration branch and cutoff are where an old patient's carried-over money
-- and history are dated. They used to be typed per session into Settings → Data
-- entry, which no longer exists; they are the clinic's configuration now.

ALTER TABLE "settings" RENAME COLUMN "patient_ref_last" TO "patient_ref_next";--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "patient_ref_next" SET DEFAULT 1;--> statement-breakpoint
UPDATE "settings" SET "patient_ref_next" = "patient_ref_next" + 1;--> statement-breakpoint

ALTER TABLE "settings" ADD COLUMN "migration_branch_id" uuid REFERENCES "branches"("id");--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "migration_cutoff_date" date;--> statement-breakpoint

ALTER TABLE "appointments" ADD COLUMN "is_imported" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "date_unknown" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_date_unknown_imported" CHECK (NOT "date_unknown" OR "is_imported");
