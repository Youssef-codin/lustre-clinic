-- Hand-written, like 0012. Every existing branch starts on regular WhatsApp;
-- the one on Business is switched in Settings.
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "whatsapp_app" text NOT NULL DEFAULT 'regular';
