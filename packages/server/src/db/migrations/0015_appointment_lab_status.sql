-- Hand-written, like 0014. Null means the visit needs no lab, which is what
-- every existing appointment is, so there is nothing to backfill. The CHECK
-- rides on the ADD COLUMN so the whole statement is skipped on a re-run.
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "lab_status" text
    CONSTRAINT "appointments_lab_status_valid" CHECK ("lab_status" IN ('pending', 'ready'));
