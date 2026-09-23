/**
 * Which `/ws` events become "the doctor is finished" on the desk's phone. Pure,
 * so the rule is tested without `expo-notifications`.
 */
import { type ClientRole, WS_EVENT } from '@lustre/shared';
import type { ServerEvent } from '../api/serverEvents';

/**
 * A completion replayed after a long drop is about a patient who has already
 * paid and gone. The refetch still happens; only the buzz is withheld.
 */
export const NOTICE_MAX_AGE_MS = 10 * 60_000;

/** The appointment to announce, or null when this event is not one to announce on this phone. */
export function completionToAnnounce(event: ServerEvent, role: ClientRole, now: number): string | null {
    if (role !== 'secretary' || event.event !== WS_EVENT.VISIT_COMPLETED || !event.id) return null;
    if (now - event.at > NOTICE_MAX_AGE_MS) return null;
    return event.id;
}

/**
 * The OS notification's identifier. Android replaces a notification posted
 * under an identifier it is already showing, so even a second delivery of the
 * same completion could only ever redraw the one notification.
 */
export function noticeIdentifier(appointmentId: string): string {
    return `lustre.visit.completed.${appointmentId}`;
}
