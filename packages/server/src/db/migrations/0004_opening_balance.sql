-- Generated, then trimmed by hand. drizzle-kit's snapshot had never seen the
-- hand-written 0002 and 0003, so it re-emitted the payment check constraint and
-- `custom_questions.label_ar` alongside this column. Both are already in the
-- database; re-running them would fail on the constraint. Only the new column
-- is left here, and `0004_snapshot.json` now records all three, so the next
-- generate starts from what is actually there.
--
-- Debt carried over from the old system has nowhere to live: a balance is
-- derived per visit (§10) and a visit needs an appointment, so a patient who
-- arrived owing 800 gets a synthetic one of each, dated at the cutoff. This
-- flag is how every reader tells that row apart from a real one — see the note
-- in `schema.ts` for which of them count it and which do not.
--
-- Defaulted, so every appointment already on file is what it looks like.

ALTER TABLE "appointments" ADD COLUMN "is_opening_balance" boolean DEFAULT false NOT NULL;
