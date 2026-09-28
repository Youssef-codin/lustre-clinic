-- Hand-written, like 0020: the snapshots stop at 0010, so drizzle-kit would
-- diff against a schema eleven migrations old. Nothing has read these since
-- 1.6.0 dated an old patient's balance on the day of registration.
ALTER TABLE "settings" DROP COLUMN IF EXISTS "migration_branch_id";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "migration_cutoff_date";
