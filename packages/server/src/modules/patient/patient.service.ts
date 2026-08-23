/**
 * SPEC §5, §13. Phone is normalized to E.164 on write; age is derived at read
 * time and never stored.
 *
 * `byId` returns the patient and their whole history in one payload (§13), so
 * the records screen is a single round trip. That history is over appointments
 * rather than visits — see the method.
 *
 * Search uses a trigram-free substring `ILIKE` deliberately — thousands of
 * patients, not millions — and normalizes the phone term first so `0101…`
 * finds `+20101…`. `create` validates the full questionnaire (a new record is
 * the form answered in one sitting), while `update` merges a partial `custom`
 * patch and does not re-check answers the caller left out. `createMinimal`
 * (used by appointment booking) takes whatever of the record the booking
 * collected and deliberately skips questionnaire validation — the secretary is
 * on the phone, and the questions are answered at the desk.
 */
import type { AppointmentStatus } from '@lustre/shared';
import { asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db, type Executor } from '../../db/index.ts';
import {
    appointmentProcedures,
    appointments,
    patients,
    payments,
    procedureTypes,
    visitProcedures,
    visits,
} from '../../db/schema.ts';
import { AppError } from '../../errors/AppError.ts';
import { normalizePhone } from '../../util/phone.ts';
import { ageFromBirthDate } from '../../util/time.ts';
import type { Answers, QuestionnaireGap } from '../customQuestion/customQuestion.service.ts';
import { customQuestionService } from '../customQuestion/customQuestion.service.ts';
import type {
    CreatePatientInput,
    PatientByPhoneInput,
    RecentPatientsInput,
    SearchPatientInput,
    UpdatePatientInput,
} from './patient.schema.ts';

export type PatientRow = typeof patients.$inferSelect;

/** What a booking knows about a patient it is creating — `createPatientInput` less the questionnaire. */
export type MinimalPatientInput = Omit<CreatePatientInput, 'custom'>;

export interface Patient extends PatientRow {
    age: number | null;
}

/** What was done, or — when the patient never got to the chair — what was going to be. */
export interface PatientHistoryProcedure {
    name: string;
    quantity: number;
    tooth: string | null;
}

/**
 * One row of a patient's history: an appointment, and the visit it became if it
 * became one. A cancellation and a no-show never produce a visit and are still
 * part of the history a record is read for, so the row is keyed by the
 * appointment and every visit-side field is nullable.
 */
export interface PatientHistoryEntry {
    appointmentId: string;
    visitId: string | null;
    ref: string;
    startsAt: Date;
    status: AppointmentStatus;
    checkedInAt: Date | null;
    completedAt: Date | null;
    /** Debt carried over from the old system, not a visit. The record labels it rather than drawing it as one. */
    isOpeningBalance: boolean;
    computedTotal: number;
    chargedTotal: number;
    paidTotal: number;
    balance: number;
    procedures: PatientHistoryProcedure[];
}

export interface PatientDetail {
    patient: Patient;
    history: PatientHistoryEntry[];
    questionnaireGaps: QuestionnaireGap[];
}

/**
 * The page the list opens on, and how many there are in total. `total` counts
 * the register, not the page — the list draws it beside its heading, so a second
 * round trip for one integer would be a wasted call over Tailscale.
 */
export interface RecentPatients {
    patients: Patient[];
    total: number;
}

/** Exported for callers that already hold the row — `migration.enter` writes one and returns it. */
export function toPatient(row: PatientRow): Patient {
    return { ...row, age: ageFromBirthDate(row.birthDate) };
}

function answersOf(row: PatientRow): Answers {
    return (row.custom ?? {}) as Answers;
}

function isPresent<T>(value: T | null): value is T {
    return value !== null;
}

/** Grouped by visit, in the order the lines were priced. */
async function proceduresByVisit(visitIds: string[]): Promise<Map<string, PatientHistoryProcedure[]>> {
    if (visitIds.length === 0) return new Map();

    const rows = await db
        .select({
            key: visitProcedures.visitId,
            name: procedureTypes.name,
            quantity: visitProcedures.quantity,
            tooth: visitProcedures.tooth,
        })
        .from(visitProcedures)
        .innerJoin(procedureTypes, eq(procedureTypes.id, visitProcedures.procedureId))
        .where(inArray(visitProcedures.visitId, visitIds));

    return group(rows);
}

/** Grouped by appointment, in the order the booking planned them. */
async function proceduresByAppointment(
    appointmentIds: string[],
): Promise<Map<string, PatientHistoryProcedure[]>> {
    if (appointmentIds.length === 0) return new Map();

    const rows = await db
        .select({
            key: appointmentProcedures.appointmentId,
            name: procedureTypes.name,
            quantity: appointmentProcedures.quantity,
            tooth: appointmentProcedures.tooth,
        })
        .from(appointmentProcedures)
        .innerJoin(procedureTypes, eq(procedureTypes.id, appointmentProcedures.procedureId))
        .where(inArray(appointmentProcedures.appointmentId, appointmentIds))
        .orderBy(appointmentProcedures.sortOrder);

    return group(rows);
}

function group(
    rows: Array<{ key: string; name: string; quantity: number; tooth: string | null }>,
): Map<string, PatientHistoryProcedure[]> {
    const grouped = new Map<string, PatientHistoryProcedure[]>();
    for (const { key, ...procedure } of rows) {
        const bucket = grouped.get(key);
        if (bucket) bucket.push(procedure);
        else grouped.set(key, [procedure]);
    }
    return grouped;
}

async function requireRow(id: string): Promise<PatientRow> {
    const [row] = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
    if (!row) throw AppError.notFound('patient');
    return row;
}

export const patientService = {
    async search(input: SearchPatientInput): Promise<Patient[]> {
        const term = input.q.trim();
        if (!term) return [];

        let phoneTerm = term;
        try {
            phoneTerm = normalizePhone(term);
        } catch {}

        const rows = await db
            .select()
            .from(patients)
            .where(or(ilike(patients.name, `%${term}%`), ilike(patients.phone, `%${phoneTerm}%`)))
            .orderBy(desc(patients.createdAt))
            .limit(input.limit);

        return rows.map(toPatient);
    },

    /**
     * Everyone already on file under this number, oldest first.
     *
     * `phone` is indexed but not unique, and deliberately: two siblings share a
     * mother's number, and refusing the second one at the desk would be
     * refusing a patient. So this answers with a list and lets the caller
     * decide — data entry warns and carries on, because over a long migration
     * session the same patient does get typed twice.
     *
     * A term that will not normalize is not a duplicate, it is a number still
     * being typed, so it answers `[]` rather than throwing `INVALID_PHONE`.
     * Matching is on the normalized form, so `0101…` finds a stored `+20101…`.
     */
    async byPhone(input: PatientByPhoneInput): Promise<Patient[]> {
        let phone: string;
        try {
            phone = normalizePhone(input.phone);
        } catch {
            return [];
        }

        const rows = await db
            .select()
            .from(patients)
            .where(eq(patients.phone, phone))
            .orderBy(asc(patients.createdAt));

        return rows.map(toPatient);
    },

    /**
     * Who was registered last, newest first — what the Patients tab opens on
     * before anything is typed. `search` deliberately answers `[]` for an empty
     * term, so browsing needed a procedure of its own rather than a term that
     * matches everybody.
     */
    async recent(input: RecentPatientsInput): Promise<RecentPatients> {
        const rows = await db.select().from(patients).orderBy(desc(patients.createdAt)).limit(input.limit);

        const [counted] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(patients);

        return { patients: rows.map(toPatient), total: counted?.total ?? 0 };
    },

    /**
     * The record in one payload (§13). Driven from `appointments`, not `visits`:
     * a no-show and a cancellation never produce a visit, and a record read to
     * answer "has this patient turned up before" has to show them. The visit is
     * left-joined, so every money column is zero until there is one.
     *
     * Procedures come from the visit when the patient reached the chair — those
     * carry the price actually billed — and from the booking when they did not,
     * which is the only record of what was going to be done. Both are fetched
     * once for the whole history rather than per row.
     */
    async byId(id: string): Promise<PatientDetail> {
        const patient = await requireRow(id);

        const paid = db
            .select({
                visitId: payments.visitId,
                paidTotal: sql<number>`COALESCE(SUM(${payments.amount}), 0)::int`.as('paid_total'),
            })
            .from(payments)
            .groupBy(payments.visitId)
            .as('paid');

        const rows = await db
            .select({
                appointmentId: appointments.id,
                visitId: visits.id,
                ref: appointments.ref,
                startsAt: appointments.startsAt,
                status: appointments.status,
                isOpeningBalance: appointments.isOpeningBalance,
                checkedInAt: visits.checkedInAt,
                completedAt: visits.completedAt,
                computedTotal: visits.computedTotal,
                chargedTotal: visits.chargedTotal,
                paidTotal: sql<number>`COALESCE(${paid.paidTotal}, 0)::int`,
            })
            .from(appointments)
            .leftJoin(visits, eq(visits.appointmentId, appointments.id))
            .leftJoin(paid, eq(paid.visitId, visits.id))
            .where(eq(appointments.patientId, id))
            .orderBy(desc(appointments.startsAt));

        const performed = await proceduresByVisit(rows.map((r) => r.visitId).filter(isPresent));
        const planned = await proceduresByAppointment(
            rows.filter((r) => r.visitId === null).map((r) => r.appointmentId),
        );

        return {
            patient: toPatient(patient),
            history: rows.map((r) => {
                const chargedTotal = r.chargedTotal ?? 0;
                const paidTotal = r.paidTotal ?? 0;
                return {
                    ...r,
                    computedTotal: r.computedTotal ?? 0,
                    chargedTotal,
                    paidTotal,
                    balance: chargedTotal - paidTotal,
                    procedures: (r.visitId ? performed.get(r.visitId) : planned.get(r.appointmentId)) ?? [],
                };
            }),
            questionnaireGaps: await customQuestionService.auditAnswers(answersOf(patient)),
        };
    },

    async create(input: CreatePatientInput): Promise<Patient> {
        const custom = await customQuestionService.validateIntake(input.custom);

        const [row] = await db
            .insert(patients)
            .values({
                id: Bun.randomUUIDv7(),
                name: input.name,
                phone: normalizePhone(input.phone),
                email: input.email ?? null,
                birthDate: input.birthDate ?? null,
                gender: input.gender ?? null,
                custom,
                notes: input.notes ?? null,
                legacyRef: input.legacyRef ?? null,
            })
            .returning();

        if (!row) throw AppError.internal('patient insert returned nothing');
        return toPatient(row);
    },

    async update({ id, ...patch }: UpdatePatientInput): Promise<Patient> {
        const current = await requireRow(id);

        const custom = patch.custom
            ? await customQuestionService.validatePatch(answersOf(current), patch.custom)
            : undefined;

        const [row] = await db
            .update(patients)
            .set({
                ...patch,
                ...(patch.phone ? { phone: normalizePhone(patch.phone) } : {}),
                ...(custom ? { custom } : {}),
            })
            .where(eq(patients.id, id))
            .returning();

        if (!row) throw AppError.notFound('patient');
        return toPatient(row);
    },

    async createMinimal(input: MinimalPatientInput, executor: Executor = db): Promise<PatientRow> {
        const [row] = await executor
            .insert(patients)
            .values({
                id: Bun.randomUUIDv7(),
                name: input.name,
                phone: normalizePhone(input.phone),
                email: input.email ?? null,
                birthDate: input.birthDate ?? null,
                gender: input.gender ?? null,
                notes: input.notes ?? null,
                legacyRef: input.legacyRef ?? null,
            })
            .returning();

        if (!row) throw AppError.internal('patient insert returned nothing');
        return row;
    },

    async requireExists(id: string): Promise<PatientRow> {
        return requireRow(id);
    },
};
