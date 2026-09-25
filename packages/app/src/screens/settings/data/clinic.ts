/**
 * The one thing Settings → Clinic decides that is not just text in a box. It is
 * not React, so it is tested without a renderer.
 *
 * ## The next patient number
 *
 * It is the number the **next new patient will be given** — not the last one
 * handed out. It used to be the latter, labelled `Last patient number`, and
 * every clinic that typed 910 into it watched the next patient come out as 911.
 * The field says "next" now, the column says `patient_ref_next`, and the value
 * is handed out as it stands.
 *
 * One is the lowest it can be, because a patient numbered zero is not a number
 * anyone writes on a file. The server refuses a value at or below a ref a
 * patient already has — it is the only side that can see the register — so this
 * only checks what the field itself can know.
 */
import { MAX_PATIENT_REF } from '@lustre/shared';

export function patientNumberDigits(text: string): string {
    return text.replace(/\D/g, '').slice(0, 10);
}

/** What is wrong with the typed next number, or null. Blank counts as wrong — the field is required. */
export function patientNumberError(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed === '') return 'Type the number the next new patient should get.';

    const number = Number(trimmed);
    if (!Number.isInteger(number) || number < 1) return 'The first patient number is 1.';
    if (number > MAX_PATIENT_REF) return 'That number is larger than the system will hold.';

    return null;
}
