import { randomBytes } from 'node:crypto';
import type {
    AppointmentWithPatient,
    CreateAppointmentBody,
    DayAppointments,
    IsoDate,
    UpdateAppointmentBody,
} from '@mawid/shared';
import { ERROR_CODE } from '@mawid/shared';
import { and, eq, gte, lt } from 'drizzle-orm';
import { getConfig } from '../../config/index.ts';
import { getDb, getSqlite, type Querier, schema } from '../../db/index.ts';
import { toAppointmentWithPatient } from '../../db/mappers.ts';
import { AppError } from '../../errors/AppError.ts';
import { clinicDayBounds, fitsWorkingHours, nowIso } from '../../util/time.ts';
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
 * Read off paper by a human or a camera, so the alphabet drops characters that
 * are misread — no O/0, I/1, S/5, Z/2, B/8.
 */
const REF_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY34679';
const REF_LENGTH = 5;
const REF_ATTEMPTS = 20;

function randomRef(): string {
    let ref = '';
    for (const byte of randomBytes(REF_LENGTH)) {
        ref += REF_ALPHABET.charAt(byte % REF_ALPHABET.length);
    }
    return ref;
}

function uniqueRef(db: Querier): string {
    for (let attempt = 0; attempt < REF_ATTEMPTS; attempt += 1) {
        const ref = randomRef();
        const taken = db
            .select({ id: schema.appointments.id })
            .from(schema.appointments)
            .where(eq(schema.appointments.ref, ref))
            .get();
        if (!taken) return ref;
    }
    // 26^5 codes: reaching here means something is wrong, not that the clinic is busy.
    throw AppError.internal('Could not allocate an unused appointment ref');
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

        return tx
            .insert(schema.appointments)
            .values({
                ref: uniqueRef(tx),
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
    });

    const appointment = loadWithPatient(created.id);
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
