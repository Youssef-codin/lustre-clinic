/**
 * The visit note, as a form holds it and as `appointment.update` takes it.
 *
 * One note per appointment (`appointments.note`) — `visits` has no column, and
 * the desk, the doctor's sheet and the chair all read the appointment's. So a
 * note typed on the booking page and a note typed in the chair are the same
 * note, and every screen that edits one goes through here.
 *
 * A form holds a string; the column holds `string | null`. Blank and absent are
 * the same thing to the desk — a note cleared to whitespace is a note removed —
 * so the draft trims to `null` and the patch is sent only when it differs from
 * what the row already has. Unchanged means no key at all: `appointment.update`
 * patches what it is given, and sending the same note back would rewrite the
 * row (and its `updatedAt`) for a screen nobody edited.
 */

/** What a note field opens on. */
export function noteDraft(note: string | null | undefined): string {
    return note ?? '';
}

/** The note as the server holds it: blank is no note. */
export function noteValue(draft: string): string | null {
    return draft.trim() || null;
}

export function noteChanged(original: string | null | undefined, draft: string): boolean {
    return noteValue(draft) !== noteValue(original ?? '');
}
