import { ERROR_CODE, type PaymentMethod } from '@mawid/shared';
import { offsetForDate } from '../time';
import { asRequestError, httpTransport, SERVER_URL, type Transport } from './client';
import { fixtureTransport } from './fixtures';
import type {
    Appointment,
    AppointmentRow,
    Branch,
    ClinicDay,
    ClinicSettings,
    Patient,
    Visit,
    VisitRow,
    WalkInResult,
} from './types';

/**
 * Every call the day view makes, in one file.
 *
 * This is the seam. When the real tRPC client lands (BLOCKED.md) the bodies
 * below become `trpc.appointment.byDate.useQuery(…)` and the casts go with
 * them; nothing above this file knows which it is talking to.
 */

const transport: Transport = SERVER_URL ? httpTransport(SERVER_URL) : fixtureTransport();

/** Running without a clinic to talk to. The screen says so rather than lying. */
export const usingFixtures = SERVER_URL === undefined;

/**
 * The cast the missing client would have made for us. It is unchecked, and
 * deliberately in one place: a shape that drifts breaks here, not in a screen.
 */
function shaped<T>(value: unknown): T {
    return value as T;
}

export const api = {
    schedule: async (): Promise<ClinicDay[]> => shaped(await transport.query('settings.schedule')),

    settings: async (): Promise<ClinicSettings> => shaped(await transport.query('settings.get')),

    branches: async (): Promise<Branch[]> =>
        shaped(await transport.query('branch.list', { includeInactive: false })),

    /**
     * The offset is taken from the date itself rather than from the caller —
     * see `offsetForDate`. A day on the far side of a DST changeover needs the
     * offset that was in force on it, and no screen should have to remember
     * that.
     */
    byDate: async (date: string, branchId?: string): Promise<Appointment[]> =>
        shaped(
            await transport.query('appointment.byDate', {
                date,
                offsetMinutes: offsetForDate(date),
                branchId,
            }),
        ),

    /** A month in one request — see `Transport.queryMany`. */
    byDates: async (dates: readonly string[]): Promise<Appointment[][]> =>
        shaped(
            await transport.queryMany(
                'appointment.byDate',
                dates.map((date) => ({ date, offsetMinutes: offsetForDate(date) })),
            ),
        ),

    searchPatients: async (q: string): Promise<Patient[]> =>
        shaped(await transport.query('patient.search', { q, limit: 8 })),

    checkIn: async (appointmentId: string): Promise<VisitRow> =>
        shaped(await transport.mutate('visit.checkIn', { appointmentId })),

    walkIn: async (input: {
        patient: { kind: 'existing'; patientId: string } | { kind: 'new'; name: string; phone: string };
        branchId: string;
        durationMinutes?: number;
        offsetMinutes: number;
    }): Promise<WalkInResult> => shaped(await transport.mutate('appointment.walkIn', input)),

    cancel: async (id: string): Promise<AppointmentRow> =>
        shaped(await transport.mutate('appointment.cancel', { id })),

    markNoShow: async (id: string): Promise<AppointmentRow> =>
        shaped(await transport.mutate('appointment.update', { id, status: 'no_show' })),

    awaitPayment: async (id: string): Promise<AppointmentRow> =>
        shaped(await transport.mutate('appointment.awaitPayment', { id })),

    checkOut: async (input: {
        visitId: string;
        chargedTotal: number;
        paidTotal: number;
        method: PaymentMethod;
        methodNote?: string | null;
    }): Promise<Visit> => shaped(await transport.mutate('visit.checkOut', input)),

    visitById: async (id: string): Promise<Visit> => shaped(await transport.query('visit.byId', { id })),
};

/**
 * The visit behind an appointment.
 *
 * `appointments` carries no `visit_id` and `visit.byAppointment` is not on the
 * router (BLOCKED.md), so the only ids the client is ever handed come back from
 * `visit.checkIn` and `appointment.walkIn`. They are remembered here for the
 * session, and the server is asked only when this does not know — which
 * succeeds against the fixtures and fails against a real server until that one
 * procedure exists.
 */
const visitIds = new Map<string, string>();

export function rememberVisit(appointmentId: string, visitId: string): void {
    visitIds.set(appointmentId, visitId);
}

export async function visitForAppointment(appointmentId: string): Promise<Visit | null> {
    const known = visitIds.get(appointmentId);
    if (known) return api.visitById(known);

    let raw: unknown;
    try {
        raw = await transport.query('visit.byAppointment', { appointmentId });
    } catch (err) {
        // Only "there is no such procedure" is an answer. The router does not
        // carry `visit.byAppointment` yet, and tRPC reports an unknown path as
        // NOT_FOUND — that is the case this call is expected to lose, and it
        // means "cannot look it up", not "no visit".
        //
        // Anything else — the clinic PC down, a timeout, a 500 — is a failure,
        // and swallowing it would show "checked in before the app was opened"
        // for a server that is simply unreachable, with no error and no retry.
        const failure = asRequestError(err);
        if (failure.offline || failure.code !== ERROR_CODE.NOT_FOUND) throw failure;
        return null;
    }

    const visit = shaped<Visit | null>(raw);
    if (visit) visitIds.set(appointmentId, visit.id);
    return visit;
}
