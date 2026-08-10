import type { PaymentMethod } from '@mawid/shared';
import { errorCodeOf, isOffline, trpcClient } from '../../../api';
import { offsetForDate } from '../time';
import { RequestError } from './client';
import type {
    Appointment,
    AppointmentRow,
    Branch,
    ClinicDay,
    ClinicSettings,
    Patient,
    PendingReminder,
    ProcedureType,
    Visit,
    VisitRow,
    WalkInResult,
} from './types';

/**
 * Every call the day view makes, in one file, over the real tRPC client.
 *
 * The client is typed from `AppRouter`, so a procedure that moves or an input
 * that changes shape fails here at compile time rather than at the clinic.
 *
 * Two things it still has to do by hand. Dates arrive as strings — the server
 * returns `Date` and there is no transformer either side, so the inferred types
 * say `Date` while the wire carries ISO strings (`api/types.ts`). And the
 * screens read `RequestError`, which carries the `ERROR_CODE` they localize
 * from; `wrap` is where a tRPC failure becomes one.
 */

/**
 * The Date/string gap, in one place. Everything above this file reads the local
 * interfaces in `types.ts`, which say `string` because that is what arrives.
 * When a transformer lands on the server these casts come out and the inferred
 * types are used directly.
 */
function shaped<T>(value: unknown): T {
    return value as T;
}

/** A tRPC failure, in the terms `errors.ts` switches on. */
async function wrap<T>(run: () => Promise<unknown>): Promise<T> {
    try {
        return shaped<T>(await run());
    } catch (err) {
        if (err instanceof RequestError) throw err;
        throw new RequestError(errorCodeOf(err), err instanceof Error ? err.message : 'request failed', {
            offline: isOffline(err),
            cause: err,
        });
    }
}

export const api = {
    schedule: (): Promise<ClinicDay[]> => wrap(() => trpcClient.settings.schedule.query()),

    settings: (): Promise<ClinicSettings> => wrap(() => trpcClient.settings.get.query()),

    branches: (): Promise<Branch[]> => wrap(() => trpcClient.branch.list.query({ includeInactive: false })),

    /**
     * The offset is taken from the date itself rather than from the caller —
     * see `offsetForDate`. A day on the far side of a DST changeover needs the
     * offset that was in force on it, and no screen should have to remember
     * that.
     */
    byDate: (date: string, branchId?: string): Promise<Appointment[]> =>
        wrap(() =>
            trpcClient.appointment.byDate.query({
                date,
                offsetMinutes: offsetForDate(date),
                branchId,
            }),
        ),

    /**
     * A month in one request. These are separate calls, but `httpBatchLink`
     * collects them into a single POST — thirty-one round trips over Tailscale
     * is a visibly slow sheet and one is not.
     */
    byDates: (dates: readonly string[]): Promise<Appointment[][]> =>
        wrap(() =>
            Promise.all(
                dates.map((date) =>
                    trpcClient.appointment.byDate.query({
                        date,
                        offsetMinutes: offsetForDate(date),
                    }),
                ),
            ),
        ),

    /** The selectable procedures, for the name behind an appointment's `typeId`. */
    procedures: (): Promise<ProcedureType[]> => wrap(() => trpcClient.procedure.list.query()),

    /**
     * §11 — what is owed a message. `dueOnly` is the server's default and the
     * one the screen wants: a reminder that is not due yet is not work.
     */
    pendingReminders: (date: string): Promise<PendingReminder[]> =>
        wrap(() =>
            trpcClient.reminder.pending.query({
                dueOnly: true,
                limit: 100,
                offsetMinutes: offsetForDate(date),
            }),
        ),

    markReminderSent: (id: string): Promise<unknown> =>
        wrap(() => trpcClient.reminder.markSent.mutate({ id })),

    markReminderSkipped: (id: string): Promise<unknown> =>
        wrap(() => trpcClient.reminder.markSkipped.mutate({ id })),

    searchPatients: (q: string): Promise<Patient[]> =>
        wrap(() => trpcClient.patient.search.query({ q, limit: 8 })),

    checkIn: (appointmentId: string): Promise<VisitRow> =>
        wrap(() => trpcClient.visit.checkIn.mutate({ appointmentId })),

    walkIn: (input: {
        patient: { kind: 'existing'; patientId: string } | { kind: 'new'; name: string; phone: string };
        branchId: string;
        durationMinutes?: number;
        offsetMinutes: number;
    }): Promise<WalkInResult> => wrap(() => trpcClient.appointment.walkIn.mutate(input)),

    cancel: (id: string): Promise<AppointmentRow> => wrap(() => trpcClient.appointment.cancel.mutate({ id })),

    markNoShow: (id: string): Promise<AppointmentRow> =>
        wrap(() => trpcClient.appointment.update.mutate({ id, status: 'no_show' })),

    awaitPayment: (id: string): Promise<AppointmentRow> =>
        wrap(() => trpcClient.appointment.awaitPayment.mutate({ id })),

    checkOut: (input: {
        visitId: string;
        chargedTotal: number;
        paidTotal: number;
        method: PaymentMethod;
        methodNote?: string | null;
    }): Promise<Visit> => wrap(() => trpcClient.visit.checkOut.mutate(input)),

    visitById: (id: string): Promise<Visit> => wrap(() => trpcClient.visit.byId.query({ id })),
};

/**
 * The visit behind an appointment.
 *
 * `appointments` carries no `visit_id`, so the id has to be asked for. The ids
 * this session already has are kept — a check-in hands one back, and asking
 * again for what we just created is a round trip over Tailscale for nothing —
 * but a patient checked in on another phone, or yesterday, or before the app
 * was last opened, is now reachable too.
 */
const visitIds = new Map<string, string>();

export function rememberVisit(appointmentId: string, visitId: string): void {
    visitIds.set(appointmentId, visitId);
}

export async function visitForAppointment(appointmentId: string): Promise<Visit | null> {
    const known = visitIds.get(appointmentId);
    if (known) return api.visitById(known);

    const visit = await wrap<Visit | null>(() => trpcClient.visit.byAppointment.query({ appointmentId }));
    if (visit) visitIds.set(appointmentId, visit.id);
    return visit;
}
