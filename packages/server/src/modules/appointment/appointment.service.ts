import { canTransition, ERROR_CODE, WS_EVENT } from '@mawid/shared';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db, type Executor } from '../../db/index.ts';
import { appointments, patients } from '../../db/schema.ts';
import { AppError, PG_ERROR, pgErrorCode } from '../../errors/AppError.ts';
import { buildRef } from '../../util/ref.ts';
import { dayRange } from '../../util/time.ts';
import { broadcast } from '../../ws/index.ts';
import { patientService } from '../patient/patient.service.ts';
import { reminderService } from '../reminder/reminder.service.ts';
import { settingsService } from '../settings/settings.service.ts';
import type {
    ByDateInput,
    CreateAppointmentInput,
    MissedInput,
    PatientRefInput,
    UpdateAppointmentInput,
    WalkInInput,
} from './appointment.schema.ts';

/**
 * SPEC §7. Double-booking is prevented by Postgres (§5); this service's job is
 * to turn SQLSTATE 23P01 into `SLOT_OVERLAP` so the client can say something
 * useful, and to keep the reminder row in step with the appointment.
 *
 * Missed appointments are never transitioned on a timer — they are listed for
 * someone to resolve (§7).
 */

export type AppointmentRow = typeof appointments.$inferSelect;

export interface AppointmentWithPatient extends AppointmentRow {
    patient: { id: string; name: string; phone: string };
}

/** How many refs to try before giving up. Collisions are vanishingly rare. */
const REF_ATTEMPTS = 5;

function mapWriteError(err: unknown): never {
    if (pgErrorCode(err) === PG_ERROR.EXCLUSION_VIOLATION) {
        throw new AppError(ERROR_CODE.SLOT_OVERLAP, 'that slot overlaps another appointment', 409, {
            cause: err,
        });
    }
    throw err;
}

async function resolveDuration(requested: number | undefined): Promise<number> {
    const { durationOptions, defaultDuration } = await settingsService.get();
    if (requested === undefined) return defaultDuration;

    // §7: the duration comes from the picker, which offers exactly these.
    if (!durationOptions.includes(requested)) {
        throw new AppError(ERROR_CODE.INVALID_DURATION, 'duration is not one of the configured options', 422);
    }
    return requested;
}

async function resolvePatient(executor: Executor, ref: PatientRefInput): Promise<string> {
    if (ref.kind === 'existing') {
        await patientService.requireExists(ref.patientId);
        return ref.patientId;
    }
    // §13 — the new patient is created in the same transaction as the booking.
    const created = await patientService.createMinimal(ref.name, ref.phone, executor);
    return created.id;
}

async function requireRow(id: string): Promise<AppointmentRow> {
    const [row] = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
    if (!row) throw AppError.notFound('appointment');
    return row;
}

/**
 * Inserts with a fresh `ref`, retrying only when the `ref` itself collided.
 * An overlap is a real answer and is not retried.
 */
async function insertWithRef(
    executor: Executor,
    values: Omit<typeof appointments.$inferInsert, 'id' | 'ref'>,
    offsetMinutes: number,
): Promise<AppointmentRow> {
    for (let attempt = 0; attempt < REF_ATTEMPTS; attempt += 1) {
        try {
            const [row] = await executor
                .insert(appointments)
                .values({ ...values, id: Bun.randomUUIDv7(), ref: buildRef(values.startsAt, offsetMinutes) })
                .returning();

            if (!row) throw AppError.internal('appointment insert returned nothing');
            return row;
        } catch (err) {
            if (pgErrorCode(err) === PG_ERROR.UNIQUE_VIOLATION) continue;
            mapWriteError(err);
        }
    }

    throw new AppError(ERROR_CODE.REF_GENERATION_FAILED, 'could not allocate a unique ref', 500);
}

export const appointmentService = {
    /** The day view: one day, optionally one branch, patient embedded (§13). */
    async byDate(input: ByDateInput): Promise<AppointmentWithPatient[]> {
        const { from, to } = dayRange(input.date, input.offsetMinutes);

        const rows = await db
            .select({
                appointment: appointments,
                patient: { id: patients.id, name: patients.name, phone: patients.phone },
            })
            .from(appointments)
            .innerJoin(patients, eq(appointments.patientId, patients.id))
            .where(
                and(
                    gte(appointments.startsAt, from),
                    lt(appointments.startsAt, to),
                    ...(input.branchId ? [eq(appointments.branchId, input.branchId)] : []),
                ),
            )
            .orderBy(asc(appointments.startsAt));

        return rows.map((r) => ({ ...r.appointment, patient: r.patient }));
    },

    async byId(id: string): Promise<AppointmentWithPatient> {
        const [row] = await db
            .select({
                appointment: appointments,
                patient: { id: patients.id, name: patients.name, phone: patients.phone },
            })
            .from(appointments)
            .innerJoin(patients, eq(appointments.patientId, patients.id))
            .where(eq(appointments.id, id))
            .limit(1);

        if (!row) throw AppError.notFound('appointment');
        return { ...row.appointment, patient: row.patient };
    },

    /**
     * §7 — still `booked` after it should have ended. Listed for manual
     * resolution to `no_show` or a reschedule; nothing transitions on a timer.
     */
    async missed(input: MissedInput = { limit: 100 }): Promise<AppointmentWithPatient[]> {
        const rows = await db
            .select({
                appointment: appointments,
                patient: { id: patients.id, name: patients.name, phone: patients.phone },
            })
            .from(appointments)
            .innerJoin(patients, eq(appointments.patientId, patients.id))
            .where(
                and(
                    eq(appointments.status, 'booked'),
                    sql`${appointments.startsAt} + make_interval(mins => ${appointments.durationMinutes}) < now()`,
                    ...(input.branchId ? [eq(appointments.branchId, input.branchId)] : []),
                ),
            )
            .orderBy(desc(appointments.startsAt))
            .limit(input.limit);

        return rows.map((r) => ({ ...r.appointment, patient: r.patient }));
    },

    async create(input: CreateAppointmentInput): Promise<AppointmentRow> {
        const durationMinutes = await resolveDuration(input.durationMinutes);
        const { reminderLeadHours } = await settingsService.get();
        const startsAt = new Date(input.startsAt);

        const row = await db.transaction(async (tx) => {
            const patientId = await resolvePatient(tx, input.patient);

            const appointment = await insertWithRef(
                tx,
                {
                    patientId,
                    branchId: input.branchId,
                    startsAt,
                    durationMinutes,
                    typeId: input.typeId ?? null,
                    note: input.note ?? null,
                },
                input.offsetMinutes,
            );

            // §11 — the reminder exists from the moment the booking does.
            await reminderService.scheduleFor(tx, appointment, reminderLeadHours);
            return appointment;
        });

        broadcast(WS_EVENT.APPOINTMENT_CREATED, { id: row.id });
        return row;
    },

    /**
     * §7 — a walk-in books and checks in at once, `starts_at = now`. Both rows
     * land in one transaction, and the same overlap constraint applies.
     */
    async walkIn(input: WalkInInput): Promise<{ appointment: AppointmentRow; visitId: string }> {
        const durationMinutes = await resolveDuration(input.durationMinutes);
        const { reminderLeadHours } = await settingsService.get();
        const startsAt = new Date();

        // Imported lazily: the visit module reads appointments, so a top-level
        // import in both directions would be a cycle.
        const { visitService } = await import('../visit/visit.service.ts');

        const result = await db.transaction(async (tx) => {
            const patientId = await resolvePatient(tx, input.patient);

            const appointment = await insertWithRef(
                tx,
                {
                    patientId,
                    branchId: input.branchId,
                    startsAt,
                    durationMinutes,
                    typeId: input.typeId ?? null,
                    note: input.note ?? null,
                    channel: 'walk_in',
                },
                input.offsetMinutes,
            );

            await reminderService.scheduleFor(tx, appointment, reminderLeadHours);
            // A walk-in is already here, so there is nobody to remind.
            await reminderService.skipFor(tx, appointment.id);

            const visit = await visitService.checkIn({ appointmentId: appointment.id }, tx);

            // Re-read: check-in moved the status to `checked_in`, and the
            // caller gets the appointment as it now is, not as it was inserted.
            const [current] = await tx
                .select()
                .from(appointments)
                .where(eq(appointments.id, appointment.id))
                .limit(1);

            return { appointment: current ?? appointment, visitId: visit.id };
        });

        broadcast(WS_EVENT.APPOINTMENT_CREATED, { id: result.appointment.id });
        return result;
    },

    async update(input: UpdateAppointmentInput): Promise<AppointmentRow> {
        // `startsAt` arrives as an ISO string and is applied as a Date below.
        const { id, startsAt: _startsAt, ...patch } = input;
        const current = await requireRow(id);

        if (patch.status && !canTransition(current.status, patch.status)) {
            throw new AppError(
                ERROR_CODE.INVALID_STATUS_TRANSITION,
                `cannot go from ${current.status} to ${patch.status}`,
                422,
            );
        }

        const durationMinutes =
            patch.durationMinutes === undefined ? undefined : await resolveDuration(patch.durationMinutes);
        const startsAt = input.startsAt ? new Date(input.startsAt) : undefined;

        const row = await db.transaction(async (tx) => {
            let updated: AppointmentRow | undefined;
            try {
                [updated] = await tx
                    .update(appointments)
                    .set({
                        ...patch,
                        ...(startsAt ? { startsAt } : {}),
                        ...(durationMinutes ? { durationMinutes } : {}),
                        updatedAt: new Date(),
                    })
                    .where(eq(appointments.id, id))
                    .returning();
            } catch (err) {
                mapWriteError(err);
            }

            if (!updated) throw AppError.notFound('appointment');

            if (startsAt) await reminderService.reschedule(tx, id, startsAt);
            if (patch.status === 'no_show') await reminderService.skipFor(tx, id);

            return updated;
        });

        broadcast(WS_EVENT.APPOINTMENT_UPDATED, { id });
        return row;
    },

    async cancel(id: string): Promise<AppointmentRow> {
        const current = await requireRow(id);

        if (!canTransition(current.status, 'cancelled')) {
            throw new AppError(
                ERROR_CODE.INVALID_STATUS_TRANSITION,
                `cannot cancel an appointment that is ${current.status}`,
                422,
            );
        }

        const row = await db.transaction(async (tx) => {
            const [updated] = await tx
                .update(appointments)
                .set({ status: 'cancelled', updatedAt: new Date() })
                .where(eq(appointments.id, id))
                .returning();

            if (!updated) throw AppError.notFound('appointment');

            // No message is owed for an appointment that is not happening.
            await reminderService.skipFor(tx, id);
            return updated;
        });

        broadcast(WS_EVENT.APPOINTMENT_UPDATED, { id });
        return row;
    },

    /** Used by the visit module, which owns the check-in transition itself. */
    async requireExists(id: string): Promise<AppointmentRow> {
        return requireRow(id);
    },
};
