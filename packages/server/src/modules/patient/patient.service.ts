import type {
    CreatePatientBody,
    Patient,
    PatientDetail,
    PatientSummary,
    UpdatePatientBody,
} from '@mawid/shared';
import { ERROR_CODE } from '@mawid/shared';
import { desc, eq, like, or, type SQL } from 'drizzle-orm';
import { getConfig } from '../../config/index.ts';
import { getDb, type Querier, schema } from '../../db/index.ts';
import { toAppointment, toPatient, toPatientSummary } from '../../db/mappers.ts';
import { AppError } from '../../errors/AppError.ts';
import { nowIso } from '../../util/time.ts';

/**
 * The secretary types what is written in the paper book — `01012345678`, often
 * with spaces or dashes. Normalizing on write rather than in the desk form
 * means one implementation, and it is why the same patient entered two
 * different ways on two days is still one patient.
 */
export function normalizePhone(input: string): string {
    const trimmed = input.replace(/[\s-]/g, '');
    const countryCode = getConfig().phoneCountryCode;

    if (trimmed.startsWith('+')) return trimmed;
    // 00 is how an international number is dialled locally.
    if (trimmed.startsWith('00')) return `+${trimmed.slice(2)}`;
    // A national number: the trunk 0 is dropped when the country code goes on.
    if (trimmed.startsWith('0')) return `${countryCode}${trimmed.slice(1)}`;

    return `${countryCode}${trimmed}`;
}

export function findPatientRow(id: number, db: Querier = getDb()): schema.PatientRow {
    const row = db.select().from(schema.patients).where(eq(schema.patients.id, id)).get();
    if (!row) throw AppError.notFound(`No patient with id ${id}`, ERROR_CODE.PATIENT_NOT_FOUND);
    return row;
}

export function findPatientByPhone(phone: string, db: Querier = getDb()): schema.PatientRow | undefined {
    return db.select().from(schema.patients).where(eq(schema.patients.phone, phone)).get();
}

/**
 * Takes an explicit `db` so the appointment module can create an inline patient
 * inside the same transaction as the booking — a booking that fails the overlap
 * check must not leave a patient behind.
 */
export function insertPatient(body: CreatePatientBody, db: Querier = getDb()): schema.PatientRow {
    return db
        .insert(schema.patients)
        .values({
            name: body.name,
            phone: normalizePhone(body.phone),
            notes: body.notes ?? null,
            createdAt: nowIso(),
        })
        .returning()
        .get();
}

export function createPatient(body: CreatePatientBody): Patient {
    return toPatient(insertPatient(body));
}

export function updatePatient(id: number, body: UpdatePatientBody): Patient {
    const db = getDb();
    findPatientRow(id, db);

    const changes: Partial<schema.NewPatientRow> = {};
    if (body.name !== undefined) changes.name = body.name;
    if (body.phone !== undefined) changes.phone = normalizePhone(body.phone);
    if (body.notes !== undefined) changes.notes = body.notes;

    return toPatient(
        db.update(schema.patients).set(changes).where(eq(schema.patients.id, id)).returning().get(),
    );
}

/**
 * The record and its whole history in one response, newest first. Cancelled
 * appointments are included — the page shows status per row. One round trip
 * because this page is opened by scanning a slip on a phone over clinic wifi.
 */
export function getPatientDetail(id: number): PatientDetail {
    const db = getDb();
    const patient = findPatientRow(id, db);

    const appointments = db
        .select()
        .from(schema.appointments)
        .where(eq(schema.appointments.patientId, id))
        .orderBy(desc(schema.appointments.startsAt))
        .all();

    return { patient: toPatient(patient), appointments: appointments.map(toAppointment) };
}

/**
 * One box matching name or phone. A phone query is reduced to its digits and
 * matched anywhere in the stored E.164 value, so `01012345678`, `+201012345678`
 * and `1012345678` all find the same patient — the secretary should not have to
 * know which form was saved.
 */
export function searchPatients(q: string, limit: number): PatientSummary[] {
    const digits = q.replace(/\D/g, '').replace(/^0+/, '');

    const matchers: SQL[] = [like(schema.patients.name, `%${q}%`)];
    if (digits.length > 0) matchers.push(like(schema.patients.phone, `%${digits}%`));

    return getDb()
        .select({ id: schema.patients.id, name: schema.patients.name, phone: schema.patients.phone })
        .from(schema.patients)
        .where(or(...matchers))
        .orderBy(schema.patients.name)
        .limit(limit)
        .all()
        .map(toPatientSummary);
}
