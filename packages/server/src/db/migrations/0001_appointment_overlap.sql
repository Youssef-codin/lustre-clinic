-- Hand-written. SPEC §5: double-booking is prevented by Postgres, not by
-- application code, because the consequence of a double-booking is two patients
-- arriving for the same slot.
--
-- Not expressible in Drizzle's schema DSL, so this migration is maintained by
-- hand and drizzle-kit must never be allowed to drop it. If a later generated
-- migration proposes dropping "appointments_no_overlap" or "appointment_span",
-- that is a bug.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
-- SPEC §5 writes the range inline as
--   tstzrange(starts_at, starts_at + (duration_minutes || ' minutes')::interval)
-- but Postgres rejects that: an index expression must be IMMUTABLE, and
-- `timestamptz + interval` is only STABLE. It is marked STABLE because an
-- interval carrying months or days has to be resolved against the session
-- TimeZone.
--
-- That does not apply here. make_interval(mins => n) yields a time-only
-- interval, and adding a time-only interval to a timestamptz is plain arithmetic
-- on an absolute instant — no timezone, no DST, no session state. So this
-- wrapper is genuinely immutable and may be declared as such.
--
-- Because an index depends on it, the body of this function must never change.
-- Changing it silently corrupts the constraint. Replace the constraint instead.
CREATE OR REPLACE FUNCTION appointment_span(starts_at timestamptz, duration_minutes integer)
    RETURNS tstzrange
    LANGUAGE sql
    IMMUTABLE
    STRICT
    PARALLEL SAFE
AS $$
    SELECT tstzrange(starts_at, starts_at + make_interval(mins => duration_minutes));
$$;
--> statement-breakpoint
-- The range is half-open: [starts_at, starts_at + duration). An appointment
-- ending exactly when the next begins therefore does not overlap.
--
-- Branch is deliberately NOT part of the exclusion — there is one practitioner,
-- so he cannot be in two branches at once (§5).
--
-- Only 'booked' and 'checked_in' hold a slot; cancelled and no-show rows free it.
ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_no_overlap"
    EXCLUDE USING gist (
        appointment_span(starts_at, duration_minutes) WITH &&
    ) WHERE (status IN ('booked', 'checked_in'));
