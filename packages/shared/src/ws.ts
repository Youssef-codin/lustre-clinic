import type { PrintFailure } from './print.ts';
import type { ReminderWithPatient } from './reminder.ts';
import type { WhatsAppStatus } from './whatsapp.ts';

/**
 * Events pushed over `WS /ws`. One connection is opened at the web app root and
 * shared through context — these update state directly, there is no polling.
 */

export interface ServerEvents {
    'appointment:created': { appointmentId: number; patientId: number; startsAt: string };
    'appointment:updated': { appointmentId: number; patientId: number; startsAt: string };
    /**
     * All three carry the same row `GET /api/reminders?date=` returns, so the
     * desk renders a live outcome and a fetched one through one path — and a
     * failure can name the patient without a lookup, which is the whole point
     * of putting it on screen (§15).
     *
     * `skipped` is the one the secretary must act on: nobody told that patient,
     * so she phones them. It is an event rather than refetch-only because the
     * list is useless if it only updates when someone reloads the page.
     */
    'reminder:sent': ReminderWithPatient;
    'reminder:failed': ReminderWithPatient;
    'reminder:skipped': ReminderWithPatient;
    /** Same shape the banner gets from `GET /api/print/failures`, so a live
     *  failure and a fetched one are one code path on the desk screen. */
    'print:failed': PrintFailure;
    /** The same payload `GET /api/whatsapp/status` returns — one code path. */
    'whatsapp:status': WhatsAppStatus;
    /** A printed page was scanned — the desk screen jumps to this patient. */
    scan: { appointmentId: number; patientId: number };
    /** Connection liveness only; carries nothing. */
    ping: Record<string, never>;
}

export type ServerEventName = keyof ServerEvents;

export type ServerEvent<K extends ServerEventName = ServerEventName> = {
    [E in K]: { event: E; at: string; payload: ServerEvents[E] };
}[K];
