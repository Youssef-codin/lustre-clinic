/**
 * SPEC §5, §13. Phone is normalized to E.164 on write; age is derived at read
 * time and never stored.
 *
 * `byId` returns the patient and the visit history in one payload (§13), so the
 * records screen is a single round trip.
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
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db, type Executor } from '../../db/index.ts';
import { appointments, patients, payments, visits } from '../../db/schema.ts';
import { AppError } from '../../errors/AppError.ts';
import { normalizePhone } from '../../util/phone.ts';
import { ageFromBirthDate } from '../../util/time.ts';
import type { Answers, QuestionnaireGap } from '../customQuestion/customQuestion.service.ts';
import { customQuestionService } from '../customQuestion/customQuestion.service.ts';
import type { CreatePatientInput, SearchPatientInput, UpdatePatientInput } from './patient.schema.ts';

export type PatientRow = typeof patients.$inferSelect;

/** What a booking knows about a patient it is creating — `createPatientInput` less the questionnaire. */
export type MinimalPatientInput = Omit<CreatePatientInput, 'custom'>;

export interface Patient extends PatientRow {
    age: number | null;
}

export interface PatientVisit {
    visitId: string;
    appointmentId: string;
    ref: string;
    startsAt: Date;
    checkedInAt: Date;
    completedAt: Date | null;
    computedTotal: number;
    chargedTotal: number;
    paidTotal: number;
    balance: number;
}

export interface PatientDetail {
    patient: Patient;
    visits: PatientVisit[];
    questionnaireGaps: QuestionnaireGap[];
}

function toPatient(row: PatientRow): Patient {
    return { ...row, age: ageFromBirthDate(row.birthDate) };
}

function answersOf(row: PatientRow): Answers {
    return (row.custom ?? {}) as Answers;
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
                visitId: visits.id,
                appointmentId: appointments.id,
                ref: appointments.ref,
                startsAt: appointments.startsAt,
                checkedInAt: visits.checkedInAt,
                completedAt: visits.completedAt,
                computedTotal: visits.computedTotal,
                chargedTotal: visits.chargedTotal,
                paidTotal: sql<number>`COALESCE(${paid.paidTotal}, 0)::int`,
            })
            .from(visits)
            .innerJoin(appointments, eq(visits.appointmentId, appointments.id))
            .leftJoin(paid, eq(paid.visitId, visits.id))
            .where(eq(appointments.patientId, id))
            .orderBy(desc(appointments.startsAt));

        return {
            patient: toPatient(patient),
            visits: rows.map((r) => ({ ...r, balance: r.chargedTotal - r.paidTotal })),
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
            })
            .returning();

        if (!row) throw AppError.internal('patient insert returned nothing');
        return row;
    },

    async requireExists(id: string): Promise<PatientRow> {
        return requireRow(id);
    },
};
