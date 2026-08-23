-- Generated, and clean this time: 0004 brought the snapshot up to date with the
-- hand-written 0002 and 0003, so nothing here is a re-emission.
--
-- The number the *old* system knew this patient by, typed in during the
-- migration. Free text, not a `ref`: the old system's format is its own, the
-- app never generates one of these, and nothing joins on it. It is here because
-- the paper files already carry that number, and once the old system is a
-- read-only archive it is the only thing that matches a paper file to a record
-- in this one.
--
-- Nullable and unbackfilled — a patient registered after the cutoff never had
-- an old number, and a blank says exactly that rather than inventing one.
--
-- Indexed because looking a patient up by the number written on their file is
-- the whole reason to store it.

ALTER TABLE "patients" ADD COLUMN "legacy_ref" text;--> statement-breakpoint
CREATE INDEX "patients_legacy_ref_idx" ON "patients" USING btree ("legacy_ref");
