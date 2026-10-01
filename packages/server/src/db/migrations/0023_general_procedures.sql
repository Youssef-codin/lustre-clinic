-- Hand-written, like 0020. Off for every clinic: the dental flow is the default.
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "general_procedures" boolean NOT NULL DEFAULT false;
