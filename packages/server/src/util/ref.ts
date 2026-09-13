/**
 * SPEC §5 — `appointments.ref` is `DDMMYY-XXXX`, day first, unique within the
 * date. (`patients.ref` is a plain number off `settings.patient_ref_last`, and is
 * allocated where the patient is inserted.)
 *
 * The alphabet excludes `0/O` and `1/I/L` so a ref read down the phone or
 * written by hand is unambiguous. Stored uppercase, matched case-insensitively.
 *
 * Modulo bias across the alphabet's symbols is irrelevant: uniqueness is
 * enforced by the UNIQUE constraint, not by the distribution.
 */
import { buildRef as buildRefWith, type Draw } from '@lustre/shared';

const draw: Draw = (size) => {
    const [byte = 0] = crypto.getRandomValues(new Uint8Array(1));
    return byte % size;
};

export function buildRef(startsAt: Date, offsetMinutes = 0): string {
    return buildRefWith(startsAt, draw, offsetMinutes);
}
