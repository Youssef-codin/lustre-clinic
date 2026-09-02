-- Hand-written, like 0002 and 0003, because the backfill is the point and
-- drizzle-kit only emits the DDL. Run `bun db:generate` afterwards to bring the
-- snapshot back in line; there is nothing here it would re-emit.
--
-- This clinic's own number for a patient (§5). Four characters from the ref
-- alphabet and no date on the front: an appointment ref is scoped to a day
-- because an appointment happens on one, and a patient is not an event. The
-- number is written once at the top of a page in the paper book, which is one
-- page per patient, and four characters is what someone writes there without
-- resenting it.
--
-- Distinct from `legacy_ref` on purpose and both are kept. `legacy_ref` is the
-- *old* system's number, free text, NULL for anyone registered since the
-- migration; this one is ours, generated, and on every patient. A record can
-- carry both, and during the changeover it usually will.
--
-- Three steps rather than one: the column cannot be born NOT NULL on a table
-- with rows in it, and it cannot be made UNIQUE until every row has a distinct
-- value. Existing patients are backfilled here rather than lazily, because a
-- ref that appears the first time someone opens a record is not a number you
-- can have written on a file.

ALTER TABLE "patients" ADD COLUMN "ref" text;--> statement-breakpoint

-- The generator, in SQL, so the backfill needs no application pass. It mirrors
-- `util/ref.ts`: same alphabet, same length. The inner loop re-draws on a
-- collision, which is the same answer `insertPatientWithRef` gives at runtime —
-- at 31^4 = 923,521 codes it is rare, and unbounded retry is safe because the
-- table is finite and far smaller than the space.
DO $$
DECLARE
    alphabet CONSTANT text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    target record;
    candidate text;
    position int;
BEGIN
    FOR target IN SELECT id FROM patients WHERE ref IS NULL ORDER BY created_at LOOP
        LOOP
            candidate := '';
            FOR position IN 1..4 LOOP
                candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
            END LOOP;
            EXIT WHEN NOT EXISTS (SELECT 1 FROM patients WHERE ref = candidate);
        END LOOP;

        UPDATE patients SET ref = candidate WHERE id = target.id;
    END LOOP;
END $$;--> statement-breakpoint

ALTER TABLE "patients" ALTER COLUMN "ref" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_ref_unique" UNIQUE("ref");
