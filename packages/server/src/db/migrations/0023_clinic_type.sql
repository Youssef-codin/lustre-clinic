-- Hand-written, like 0020. Every clinic so far is dental, which is the default.
-- `general` stops any procedure asking for a tooth (`procedure.rules.ts`).
--
-- A boolean `general_procedures` went out under this number on main for a few
-- hours and was reverted, so this one is dated after it and a server that ran
-- that one still runs this. A clinic that turned it on is general; then it goes.
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "clinic_type" text NOT NULL DEFAULT 'dental';--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_clinic_type_valid";--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_clinic_type_valid" CHECK ("clinic_type" IN ('dental', 'general'));--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'settings' AND column_name = 'general_procedures'
    ) THEN
        EXECUTE 'UPDATE "settings" SET "clinic_type" = ''general'' WHERE "general_procedures"';
    END IF;
END $$;--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "general_procedures";
