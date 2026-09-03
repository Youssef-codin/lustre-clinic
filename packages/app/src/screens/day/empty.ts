/**
 * What an empty day says, and what it offers.
 *
 * The day view is the one screen carrying a `BookFab` — an accent-filled 52px
 * circle holding a `+`. `EmptyState`'s ring is a 52px circle too, and its
 * default glyph is also a `+`, so the empty day used to draw the FAB twice and
 * wire up one of them. The copy here therefore never asks for a `+`: booking is
 * the FAB's job and the CTA's, and the ring only ever illustrates.
 *
 * Three states, not two. `canBook` is false on the doctor's screen, where
 * booking is the desk's job — that day is still clear, but telling the doctor to
 * book someone in offers a thing their screen does not have.
 */
export type EmptyDay = {
    title: string;
    body: string;
    /** Absent when the state is a statement rather than an offer. */
    actionLabel?: string;
    /** `none` draws no ring at all — a past day is a fact, not an invitation. */
    glyph: 'calendar' | 'none';
};

export function emptyDay(past: boolean, canBook: boolean): EmptyDay {
    if (past) {
        return {
            title: 'Nothing happened this day',
            body: 'No appointments were booked, and nobody walked in.',
            glyph: 'none',
        };
    }

    if (!canBook) {
        return {
            title: 'Nothing booked',
            body: 'The day is clear. Anything the desk books will appear here.',
            glyph: 'calendar',
        };
    }

    return {
        title: 'Nothing booked',
        body: 'The day is clear. Book someone in for later, or start a walk-in who is at the desk now.',
        actionLabel: 'Book someone in',
        glyph: 'calendar',
    };
}
