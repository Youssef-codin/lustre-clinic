/**
 * Every call the day view makes, in one file, over the real tRPC client, typed
 * from `AppRouter` so a procedure that moves fails here at compile time. Two
 * things are done by hand: dates arrive as ISO strings — there is no
 * transformer either side, so the inferred types say `Date` while the wire
 * carries strings, and `shaped`/`types.ts` bridge that gap until a transformer
 * lands — and `wrap` turns tRPC failures into the `RequestError` the screens
 * localize from. Offsets come from the date itself (`offsetForDate`) because a
 * day on the far side of a DST changeover needs the offset in force on it;
 * `byDates` is one POST over `httpBatchLink`, not thirty-one round trips.
 * Neither read carries a branch, though the procedure takes one: a day is a
 * few dozen rows, and the screens split it themselves so they can open on the
 * branch holding most of it and say what the other one is doing — which a
 * server-side filter throws away before the app can see it. The
 * visit id is not on the appointment, so `visitIds` keeps what this session
 * created and `visit.byAppointment` reaches the rest; `checkInTimes` orders
 * the waiting room by arrival, dropping a patient whose visit cannot be read
 * so the order falls back to `updatedAt` and the day still draws.
 */
import type { PaymentMethod, Tooth } from '@lustre/shared';
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
    ProcedureCategory,
    ProcedureType,
    Visit,
    VisitRow,
    WalkInResult,
} from './types';

/**
 * §7 — a procedure the booking plans. No price: the visit snapshots the
 * catalogue's at check-in, so what the client sends is what is to be done, not
 * what it costs. `tooth` is required by §5 for a tooth-specific procedure and
 * refused for the rest, which is why the picker asks the tooth first.
 */
export interface BookedProcedure {
    procedureId: string;
    quantity?: number;
    tooth?: Tooth | null;
    note?: string | null;
}

/**
 * §7/§13: book for someone on file, or create them with the appointment. A new
 * patient needs a name and a number and nothing else; the rest of the record is
 * sent when the secretary already has it, and is `null` — not absent — when she
 * does not, so the field reads as asked-and-unknown rather than never-asked.
 */
export type PatientRef =
    | { kind: 'existing'; patientId: string }
    | {
          kind: 'new';
          name: string;
          phone: string;
          email?: string | null;
          birthDate?: string | null;
          gender?: string | null;
          notes?: string | null;
      };

function shaped<T>(value: unknown): T {
    return value as T;
}

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

    byDate: (date: string): Promise<Appointment[]> =>
        wrap(() =>
            trpcClient.appointment.byDate.query({
                date,
                offsetMinutes: offsetForDate(date),
            }),
        ),

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

    procedures: (): Promise<ProcedureType[]> => wrap(() => trpcClient.procedure.list.query()),

    procedureTree: (): Promise<ProcedureCategory[]> =>
        wrap(() => trpcClient.procedure.tree.query({ includeInactive: false })),

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
        patient: PatientRef;
        branchId: string;
        durationMinutes?: number;
        procedures?: BookedProcedure[];
        note?: string | null;
        offsetMinutes: number;
    }): Promise<WalkInResult> => wrap(() => trpcClient.appointment.walkIn.mutate(input)),

    create: (input: {
        patient: PatientRef;
        branchId: string;
        startsAt: string;
        durationMinutes?: number;
        procedures?: BookedProcedure[];
        note?: string | null;
        offsetMinutes: number;
    }): Promise<AppointmentRow> => wrap(() => trpcClient.appointment.create.mutate(input)),

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

const visitIds = new Map<string, string>();

export function rememberVisit(appointmentId: string, visitId: string): void {
    visitIds.set(appointmentId, visitId);
}

export async function checkInTimes(appointmentIds: readonly string[]): Promise<Map<string, string>> {
    const visits = await Promise.all(appointmentIds.map((id) => visitForAppointment(id).catch(() => null)));

    return new Map(
        visits.flatMap((visit, index) => {
            const id = appointmentIds[index];
            return visit && id ? [[id, visit.checkedInAt] as const] : [];
        }),
    );
}

export async function visitForAppointment(appointmentId: string): Promise<Visit | null> {
    const known = visitIds.get(appointmentId);
    if (known) return api.visitById(known);

    const visit = await wrap<Visit | null>(() => trpcClient.visit.byAppointment.query({ appointmentId }));
    if (visit) visitIds.set(appointmentId, visit.id);
    return visit;
}
