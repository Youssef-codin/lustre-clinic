/**
 * Events pushed over `WS /ws`. One connection is opened at the web app root and
 * shared through context — these update state directly, there is no polling.
 */

export interface ServerEvents {
    'appointment:created': { appointmentId: number; patientId: number; startsAt: string };
    'appointment:updated': { appointmentId: number; patientId: number; startsAt: string };
    'reminder:sent': { appointmentId: number };
    'reminder:failed': { appointmentId: number; error: string };
    'print:failed': { job: string; error: string };
    'whatsapp:status': { connected: boolean; qr?: string; lastError?: string };
    /** A printed page was scanned — the desk screen jumps to this patient. */
    scan: { appointmentId: number; patientId: number };
    /** Connection liveness only; carries nothing. */
    ping: Record<string, never>;
}

export type ServerEventName = keyof ServerEvents;

export type ServerEvent<K extends ServerEventName = ServerEventName> = {
    [E in K]: { event: E; at: string; payload: ServerEvents[E] };
}[K];
