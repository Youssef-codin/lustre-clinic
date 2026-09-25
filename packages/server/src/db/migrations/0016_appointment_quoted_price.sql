-- Hand-written, like 0014. Null is the catalogue price on the day, which is
-- what every existing booking already bills at.
--
-- Journalled last, after 0020, with a later `when`: drizzle skips any
-- migration older than the last one a database applied, and 0017, 0018 and
-- 0020 merged first.
ALTER TABLE "appointment_procedures" ADD COLUMN IF NOT EXISTS "quoted_price" integer;--> statement-breakpoint
ALTER TABLE "appointment_procedures" DROP CONSTRAINT IF EXISTS "appointment_procedures_quoted_price_non_negative";--> statement-breakpoint
ALTER TABLE "appointment_procedures" ADD CONSTRAINT "appointment_procedures_quoted_price_non_negative" CHECK ("appointment_procedures"."quoted_price" >= 0);
