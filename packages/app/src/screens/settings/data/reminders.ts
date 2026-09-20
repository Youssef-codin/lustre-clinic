/**
 * The two places the reminder pane and the server disagree about shape.
 *
 * `reminder_notify_at` is a Postgres `time` and arrives as `"HH:MM"`, while the
 * pane models minutes from midnight — which is what its stepper steps, and the
 * same unit the day view measures time in, so it never needs a timezone.
 *
 * The server accepts a 1000-character template; the pane holds the mockup's 320,
 * which is the length that still reads as one message on a phone. The tighter
 * limit is the client's own rule, so it is enforced where it is drawn.
 *
 * The tokens themselves are not a third: they are `@lustre/shared`'s
 * `REMINDER_TOKENS`, rendered by the same function the senders use, because
 * a pane that offered its own list is exactly how the chips came to insert a
 * token neither sender substituted.
 */
import { type ReminderPlaceholder, renderReminderTemplate } from '@lustre/shared';

export const TEMPLATE_MAX = 320;

const DAY_MINUTES = 24 * 60;

/** `"18:30"` → 1110. Seconds are tolerated because Postgres may send them. */
export function minutesFromTime(time: string): number {
    const [hours, minutes] = time.split(':');
    const total = Number(hours) * 60 + Number(minutes);
    return Number.isFinite(total) ? Math.min(Math.max(total, 0), DAY_MINUTES - 1) : 0;
}

/** 1110 → `"18:30"`, zero-padded, which is what `updateSettingsInput` expects. */
export function timeFromMinutes(minutes: number): string {
    const wrapped = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    const hh = String(Math.floor(wrapped / 60)).padStart(2, '0');
    const mm = String(wrapped % 60).padStart(2, '0');
    return `${hh}:${mm}`;
}

/** What the pane is holding for the template field, and what it may do with it. */
export interface TemplateDraft {
    /** What the field shows: the edit if there is one, otherwise the saved message. */
    text: string;
    /** An edit that differs from what the server has. Nothing to save without one. */
    dirty: boolean;
    /** Why this text cannot be saved, phrased for the field's inline error. */
    issue: string | null;
    canSave: boolean;
}

/**
 * The template field's whole decision, kept out of the pane so it can be tested
 * without a renderer.
 *
 * `dirty` compares trimmed, because the server trims: adding a trailing space
 * and saving would write the message back unchanged, and a Save that does
 * nothing is a Save that should not have offered itself.
 *
 * A saved message can itself be too long for this pane — the server accepts
 * 1000 characters and the mockup's field holds 320 — so `issue` is read off the
 * text rather than off the edit. It explains a Save that is unavailable; it
 * does not claim anything about what is stored.
 */
export function templateDraft(draft: string | null, saved: string | undefined): TemplateDraft {
    const text = draft ?? saved ?? '';
    const over = text.length - TEMPLATE_MAX;

    const issue =
        over > 0
            ? `Too long by ${over} ${over === 1 ? 'character' : 'characters'}. The message has to fit ${TEMPLATE_MAX}.`
            : text.trim() === ''
              ? 'The message cannot be empty.'
              : null;

    const dirty = draft !== null && draft.trim() !== (saved ?? '').trim();

    return { text, dirty, issue, canSave: dirty && issue === null };
}

/**
 * The values the preview substitutes. Deliberately one fixed patient rather
 * than a real one off the list: a preview that names a real patient reads as a
 * message that has already been sent.
 *
 * The date and time are written the way the sender writes them — `YYYY-MM-DD`
 * and a 24-hour clock — because a preview that quotes a prettier time than the
 * message carries is the same lie the brace mismatch was.
 */
const SAMPLE: Record<ReminderPlaceholder, string> = {
    name: 'Nour El-Sayed',
    date: '2026-06-12',
    time: '11:35',
    branch: 'Heliopolis',
    clinic: 'Lustre Dental',
    ref: '120626-K7T4',
};

/** The template as the sender would render it, against one sample appointment. */
export function previewMessage(template: string): string {
    return renderReminderTemplate(template, SAMPLE);
}
