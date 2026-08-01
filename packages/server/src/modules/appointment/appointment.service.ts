import type {
    AppointmentWithPatient,
    CreateAppointmentBody,
    DayAppointments,
    IsoDate,
    UpdateAppointmentBody,
} from '@mawid/shared';
import { ERROR_CODE, formatAppointmentRef } from '@mawid/shared';
import { and, eq, gte, lt } from 'drizzle-orm';
import { getConfig } from '../../config/index.ts';
import { getDb, getSqlite, type Querier, schema } from '../../db/index.ts';
import { toAppointmentWithPatient } from '../../db/mappers.ts';
import { AppError } from '../../errors/AppError.ts';
import { printSlip } from '../../services/printer/index.ts';
import { createReminderFor, rescheduleReminderFor } from '../../services/reminders/index.ts';
import { clinicDate, clinicDayBounds, fitsWorkingHours, nowIso } from '../../util/time.ts';
import { broadcast } from '../../ws/index.ts';
import {
    findPatientByPhone,
    findPatientRow,
    insertPatient,
    normalizePhone,
} from '../patient/patient.service.ts';

/*
 * ---------------------------------------------------------------------------
 * The overlap check
 * ---------------------------------------------------------------------------
 *
 * Written by hand in raw SQL rather than composed through the query builder,
 * because it is the one hard correctness guarantee in the system and it should
 * be obviously correct on reading. See spec §5.
 *
 * Two half-open intervals `[start, start + duration)` overlap if, and only if,
 * each one begins before the other ends. That is the whole rule; both lines
 * below are one half of it. Half-open is what makes an appointment ending at
 * 10:30 and the next starting at 10:30 not a conflict.
 *
 * `julianday()` is used on both sides rather than string comparison: stored
 * values are ISO-8601 with a `Z`, but `datetime(x, '+N minutes')` returns
 * `YYYY-MM-DD HH:MM:SS`, and comparing those two formats as text is wrong.
 * As numbers they are directly comparable.
 *
 * `id IS NOT ?3` excludes the appointment being moved. SQLite's `IS NOT` is
 * null-safe, so passing NULL — the booking case, where nothing is excluded —
 * leaves every row in scope instead of matching none.
 */
const OVERLAP_SQL = `
    SELECT id, ref FROM appointments
     WHERE status = 'booked'
       AND id IS NOT ?3
       AND julianday(starts_at) < julianday(?1, '+' || ?2 || ' minutes')
       AND julianday(?1) < julianday(starts_at, '+' || duration_min || ' minutes')
     LIMIT 1`;

/**
 * Throws `SLOT_TAKEN` if anything booked overlaps the given window. Must be
 * called inside the same transaction as the write it guards — checking and
 * inserting separately is a race the clinic would hit the first time two
 * bookings land together.
 */
function assertSlotFree(startsAt: string, durationMin: number, excludeId: number | null): void {
    const clash = getSqlite()
        .query<{ id: number; ref: string }, [string, number, number | null]>(OVERLAP_SQL)
        .get(startsAt, durationMin, excludeId);

    if (clash) {
        throw AppError.conflict(`That time overlaps appointment ${clash.ref}`, ERROR_CODE.SLOT_TAKEN);
    }
}

/**
 * `DDMMYY-NN`, numbered per clinic day — `020826-03` is the third appointment
 * booked for the 2nd of August.
 *
 * The number comes from the highest one already used that day rather than from
 * a count, so cancelling the third booking does not hand `-03` to the fourth.
 * Two slips must never carry the same ref: `/s/:ref` resolves one appointment,
 * and the printed page is the thing patients keep.
 *
 * Read with `substr` over the ref itself instead of joining on a date column,
 * because the sequence is a property of the printed code and nothing else.
 * `CAST(... AS INTEGER)` rather than a text sort — `-9` sorts after `-10`.
 */
const NEXT_SEQUENCE_SQL = `
    SELECT MAX(CAST(substr(ref, 8) AS INTEGER)) AS highest
      FROM appointments
     WHERE substr(ref, 1, 7) = ?1`;

/**
 * Allocated inside the booking transaction, so two bookings landing together
 * cannot read the same highest number. The UNIQUE index on `ref` is the backstop.
 */
function nextRef(startsAt: string): string {
    const day = clinicDate(startsAt, getConfig().clinic.timezone);
    // `formatAppointmentRef` owns the format; this only picks the number.
    const prefix = `${formatAppointmentRef(day, 0).slice(0, 7)}`;

    const row = getSqlite().query<{ highest: number | null }, [string]>(NEXT_SEQUENCE_SQL).get(prefix);

    return formatAppointmentRef(day, (row?.highest ?? 0) + 1);
}

/** Duration comes from config, never from the request — the desk cannot disagree
 *  with the clinic's own configuration about how long a root canal takes. */
function durationFor(typeId: string): number {
    const type = getConfig().appointmentTypes.find((t) => t.id === typeId);
    if (!type) throw AppError.badRequest(`Unknown appointment type "${typeId}"`);
    return type.minutes;
}

function assertWithinWorkingHours(startsAt: string, durationMin: number): void {
    const { hours, clinic } = getConfig();
    if (!fitsWorkingHours(startsAt, durationMin, hours, clinic.timezone)) {
        throw new AppError(
            422,
            ERROR_CODE.OUTSIDE_WORKING_HOURS,
            "That time is outside the clinic's working hours",
        );
    }
}

function loadWithPatient(id: number, db: Querier = getDb()): AppointmentWithPatient {
    const row = db
        .select({ appt: schema.appointments, patient: schema.patients })
        .from(schema.appointments)
        .innerJoin(schema.patients, eq(schema.appointments.patientId, schema.patients.id))
        .where(eq(schema.appointments.id, id))
        .get();

    if (!row) throw AppError.notFound(`No appointment with id ${id}`, ERROR_CODE.APPOINTMENT_NOT_FOUND);
    return toAppointmentWithPatient(row.appt, row.patient);
}

export function getAppointment(id: number): AppointmentWithPatient {
    return loadWithPatient(id);
}

/**
 * One clinic-local day, in time order. Cancelled appointments are included and
 * carry their status — the desk decides how to show them. The printed schedule
 * leaves them out, but that render happens server-side.
 */
export function listDay(date: IsoDate): DayAppointments {
    const { start, end } = clinicDayBounds(date, getConfig().clinic.timezone);

    return getDb()
        .select({ appt: schema.appointments, patient: schema.patients })
        .from(schema.appointments)
        .innerJoin(schema.patients, eq(schema.appointments.patientId, schema.patients.id))
        .where(
            and(
                gte(schema.appointments.startsAt, start.toISOString()),
                lt(schema.appointments.startsAt, end.toISOString()),
            ),
        )
        .orderBy(schema.appointments.startsAt)
        .all()
        .map((row) => toAppointmentWithPatient(row.appt, row.patient));
}

/** Booked appointments touching a window — what the slot finder works around. */
export function bookedOverlapping(startsAt: Date, endsAt: Date): { start: Date; end: Date }[] {
    return getSqlite()
        .query<{ starts_at: string; duration_min: number }, [string, string]>(
            `SELECT starts_at, duration_min FROM appointments
              WHERE status = 'booked'
                AND julianday(starts_at) < julianday(?2)
                AND julianday(starts_at, '+' || duration_min || ' minutes') > julianday(?1)
              ORDER BY starts_at`,
        )
        .all(startsAt.toISOString(), endsAt.toISOString())
        .map((row) => ({
            start: new Date(row.starts_at),
            end: new Date(new Date(row.starts_at).getTime() + row.duration_min * 60_000),
        }));
}

export function createAppointment(body: CreateAppointmentBody): AppointmentWithPatient {
    const durationMin = durationFor(body.typeId);
    assertWithinWorkingHours(body.startsAt, durationMin);

    const db = getDb();
    const now = nowIso();

    // The patient insert, the overlap check and the appointment insert are one
    // transaction: a booking rejected as SLOT_TAKEN must not leave behind the
    // walk-in patient it would have created.
    const created = db.transaction((tx) => {
        // A walk-in whose phone is already on file is the same patient, not a
        // second one. `insertPatient` normalizes on write, so the lookup must too.
        const patient =
            'patientId' in body
                ? findPatientRow(body.patientId, tx)
                : (findPatientByPhone(normalizePhone(body.patient.phone), tx) ??
                  insertPatient(body.patient, tx));

        assertSlotFree(body.startsAt, durationMin, null);

        const row = tx
            .insert(schema.appointments)
            .values({
                ref: nextRef(body.startsAt),
                patientId: patient.id,
                startsAt: body.startsAt,
                durationMin,
                typeId: body.typeId,
                note: body.note ?? null,
                channel: body.channel ?? 'desk',
                createdAt: now,
                updatedAt: now,
            })
            .returning()
            .get();

        // Same transaction as the booking: an appointment that exists without
        // its reminder row is a patient nobody will ever be told about.
        createReminderFor(row.id, row.startsAt, tx);

        return row;
    });

    const appointment = loadWithPatient(created.id);

    // "She books an appointment; paper comes out" — spec §7. Queued, not
    // awaited: a printer that is off must not make the booking fail.
    printSlip(appointment);

    broadcast('appointment:created', {
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        startsAt: appointment.startsAt,
    });

    return appointment;
}

export function updateAppointment(id: number, body: UpdateAppointmentBody): AppointmentWithPatient {
    const db = getDb();

    db.transaction((tx) => {
        const existing = tx.select().from(schema.appointments).where(eq(schema.appointments.id, id)).get();
        if (!existing) {
            throw AppError.notFound(`No appointment with id ${id}`, ERROR_CODE.APPOINTMENT_NOT_FOUND);
        }

        const startsAt = body.startsAt ?? existing.startsAt;
        const typeId = body.typeId ?? existing.typeId;
        const status = body.status ?? existing.status;
        const durationMin = body.typeId ? durationFor(typeId) : existing.durationMin;
        const moved = startsAt !== existing.startsAt || typeId !== existing.typeId;

        if (moved) assertWithinWorkingHours(startsAt, durationMin);
        // Re-checked whenever the result is a live booking: a move, a type change
        // and un-cancelling all have to compete for the slot the same way.
        if (status === 'booked') assertSlotFree(startsAt, durationMin, id);

        tx.update(schema.appointments)
            .set({
                startsAt,
                typeId,
                status,
                durationMin,
                note: body.note === undefined ? existing.note : body.note,
                updatedAt: nowIso(),
            })
            .where(eq(schema.appointments.id, id))
            .run();

        // A moved appointment carries its reminder with it, or the message goes
        // out relative to a time the patient is no longer expected.
        if (startsAt !== existing.startsAt) rescheduleReminderFor(id, startsAt, tx);
    });

    const appointment = loadWithPatient(id);
    broadcast('appointment:updated', {
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        startsAt: appointment.startsAt,
    });

    return appointment;
}

/** `DELETE` sets `status = 'cancelled'`. Nothing is ever removed — the history
 *  is the audit trail, and the patient page shows cancelled rows. */
export function cancelAppointment(id: number): AppointmentWithPatient {
    return updateAppointment(id, { status: 'cancelled' });
}
