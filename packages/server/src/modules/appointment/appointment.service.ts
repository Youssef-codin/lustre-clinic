/**
 * SPEC §7. Double-booking is prevented by Postgres (§5); this service's job is
 * to turn SQLSTATE 23P01 into `SLOT_OVERLAP` so the client can say something
 * useful, and to keep the reminder row in step with the appointment.
 *
 * Missed appointments are never transitioned on a timer — they are listed for
 * someone to resolve (§7).
 *
 * `insertWithRef` retries only when the generated `ref` collided; an overlap is
 * a real answer and is not retried. The walk-in path imports the visit module
 * lazily to avoid an import cycle (visit reads appointments). `awaitPayment`
 * repeats the status in the UPDATE's predicate, so the write itself decides: a
 * checkout committing `done` in between would otherwise leave a settled visit
 * stuck in `awaiting_payment` with no way back.
 */
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

export type AppointmentRow = typeof appointments.$inferSelect;

export interface AppointmentWithPatient extends AppointmentRow {
    patient: { id: string; name: string; phone: string };
}

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
    const created = await patientService.createMinimal(ref.name, ref.phone, executor);
    return created.id;
}

async function requireRow(id: string): Promise<AppointmentRow> {
    const [row] = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
    if (!row) throw AppError.notFound('appointment');
    return row;
}

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

            await reminderService.scheduleFor(tx, appointment, reminderLeadHours);
            return appointment;
        });

        broadcast(WS_EVENT.APPOINTMENT_CREATED, { id: row.id });
        return row;
    },

    async walkIn(input: WalkInInput): Promise<{ appointment: AppointmentRow; visitId: string }> {
        const durationMinutes = await resolveDuration(input.durationMinutes);
        const { reminderLeadHours } = await settingsService.get();
        const startsAt = new Date();

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
            await reminderService.skipFor(tx, appointment.id);

            const visit = await visitService.checkIn({ appointmentId: appointment.id }, tx);

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

            await reminderService.skipFor(tx, id);
            return updated;
        });

        broadcast(WS_EVENT.APPOINTMENT_UPDATED, { id });
        return row;
    },

    async awaitPayment(id: string): Promise<AppointmentRow> {
        const current = await requireRow(id);

        if (!canTransition(current.status, 'awaiting_payment')) {
            throw new AppError(
                ERROR_CODE.INVALID_STATUS_TRANSITION,
                `cannot await payment on an appointment that is ${current.status}`,
                422,
            );
        }

        const [updated] = await db
            .update(appointments)
            .set({ status: 'awaiting_payment', updatedAt: new Date() })
            .where(and(eq(appointments.id, id), eq(appointments.status, 'checked_in')))
            .returning();

        if (!updated) {
            throw new AppError(
                ERROR_CODE.INVALID_STATUS_TRANSITION,
                'the appointment stopped being checked in before the change landed',
                409,
            );
        }

        broadcast(WS_EVENT.APPOINTMENT_UPDATED, { id });
        return updated;
    },

    async requireExists(id: string): Promise<AppointmentRow> {
        return requireRow(id);
    },
};
