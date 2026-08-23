-- Hand-written, like 0001 and 0002. A custom question had one label, in
-- whichever language it was typed, so a clinic writing its questions in English
-- could not show them to an Arabic-speaking patient (§14).
--
-- The question becomes bilingual; the answer does not. An answer is stored once
-- under `patients.custom`, in whichever language it was given, so nothing here
-- touches it.
--
-- Nullable, with no backfill: existing rows have no translation, and a NOT NULL
-- would need a fake one. The resolution rule falls back to the label that
-- exists, so a clinic working in one language never has to type the other.

ALTER TABLE "custom_questions" ADD COLUMN "label_ar" text;
