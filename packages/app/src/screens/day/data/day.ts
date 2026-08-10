import type { PaymentMethod } from '@mawid/shared';
import { httpTransport, SERVER_URL, type Transport } from './client';
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

    byDate: async (date: string, offsetMinutes: number, branchId?: string): Promise<Appointment[]> =>
        shaped(await transport.query('appointment.byDate', { date, offsetMinutes, branchId })),

    /** A month in one request — see `Transport.queryMany`. */
    byDates: async (dates: readonly string[], offsetMinutes: number): Promise<Appointment[][]> =>
        shaped(
            await transport.queryMany(
                'appointment.byDate',
                dates.map((date) => ({ date, offsetMinutes })),
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

export function knownVisitId(appointmentId: string): string | undefined {
    return visitIds.get(appointmentId);
}

export async function visitForAppointment(appointmentId: string): Promise<Visit | null> {
    const known = visitIds.get(appointmentId);
    if (known) return api.visitById(known);

    const visit = shaped<Visit | null>(
        await transport.query('visit.byAppointment', { appointmentId }).catch(() => null),
    );
    if (visit) visitIds.set(appointmentId, visit.id);
    return visit;
}
