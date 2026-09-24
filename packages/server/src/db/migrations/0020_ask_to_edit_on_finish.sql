-- Hand-written, like 0014. On for every clinic, the one that has stopped
-- editing at Finish switches it off in Settings.
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "ask_to_edit_on_finish" boolean NOT NULL DEFAULT true;
