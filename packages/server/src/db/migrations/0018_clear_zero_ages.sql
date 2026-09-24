-- Hand-written. There is no age column: an age is derived from `birth_date` at
-- read time, and the editor stores a typed age N as 1 January of (the year it
-- was typed − N). So an age typed as 0 is a birth date of 1 January of the year
-- it was typed, and while age was required a 0 was how the desk got past the
-- field for someone whose age it did not have.
--
-- Matched as 1 January of the year the patient was registered, in clinic time,
-- because the phone that typed it was. No other age typed at registration
-- writes that date, and a date of birth typed off an ID card at the booking is
-- a real day, not the 1 January this conversion writes. A 0 typed on a later
-- edit in a later year cannot be told apart from a real one-year-old typed
-- then, so it is left for the desk.
--
-- Safe to rerun: `created_at` does not move, and a cleared row no longer
-- matches.
UPDATE "patients"
SET "birth_date" = NULL
WHERE "birth_date" = make_date(extract(year FROM "created_at" AT TIME ZONE 'Africa/Cairo')::int, 1, 1);
