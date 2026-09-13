/**
 * Time helpers. Every timestamp in the database is `timestamptz` (SPEC §5), so
 * these deal in absolute instants. They live in `@lustre/shared`, because the
 * demo backend has to draw the same day and derive the same age.
 */
export { ageFromBirthDate, dayRange, refDatePart } from '@lustre/shared';
