-- Hand-written, like 0013 and 0014. Whether a patient must carry an age or a
-- sex is the clinic's decision now (Settings → Patient fields), so a column
-- constraint can no longer say it: the service checks `require_age` and
-- `require_gender` on every registration instead. The defaults are today's
-- behaviour, age required and sex optional.
--
-- 0013's placeholder birth dates (1 January, a hundred years back) are left
-- where they are. Nothing tells a real one apart from a backfilled one.
--
-- Numbered 0017: 0015 and 0016 are taken by branches in flight.
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "require_age" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "require_gender" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "birth_date" DROP NOT NULL;
