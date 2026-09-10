/**
 * `server/src/modules/patient/patient.service.ts`. Phone is normalized on
 * write; age is derived at read time and never stored.
 *
 * `byId` is driven from appointments rather than visits, because a cancellation
 * and a no-show never produce a visit and a record read to answer "has this
 * patient turned up before" has to show them. Procedures come from the visit
 * when the patient reached the chair — those carry the price actually billed —
 * and from the booking when they did not.
 */
import type { RouterInput, RouterOutput } from '../../types';
import { getDb, type PatientRow, save } from '../db';
import {
    ageFromBirthDate,
    assignDefined,
    buildPatientRef,
    DemoError,
    normalizePhone,
    uuidv7,
} from '../rules';
import type { Dated } from '../wire';
import { type Answers, customQuestionHandlers } from './customQuestion';

type Patient = Dated<RouterOutput['patient']['search'][number]>;
type PatientDetail = Dated<RouterOutput['patient']['byId']>;
type HistoryEntry = PatientDetail['history'][number];
type HistoryProcedure = HistoryEntry['procedures'][number];

export function toPatient(row: PatientRow): Patient {
    return { ...row, age: ageFromBirthDate(row.birthDate) };
}

export function requirePatient(id: string): PatientRow {
    const row = getDb().patients.find((patient) => patient.id === id);
    if (!row) throw DemoError.notFound('patient');
    return row;
}

function answersOf(row: PatientRow): Answers {
    return row.custom ?? {};
}

/** `createPatientInput` less the questionnaire — what a booking knows. */
type MinimalPatientInput = Omit<RouterInput['patient']['create'], 'custom'>;

export function createMinimalPatient(input: MinimalPatientInput): PatientRow {
    const row: PatientRow = {
        id: uuidv7(),
        ref: buildPatientRef(),
        name: input.name,
        phone: normalizePhone(input.phone),
        email: input.email ?? null,
        birthDate: input.birthDate ?? null,
        gender: input.gender ?? null,
        custom: {},
        notes: input.notes ?? null,
        legacyRef: input.legacyRef ?? null,
        createdAt: new Date(),
    };

    getDb().patients.push(row);
    save();
    return row;
}

export const patientHandlers = {
    search(input: RouterInput['patient']['search']): Patient[] {
        const term = input.q.trim();
        if (!term) return [];

        // `0101…` has to find a stored `+20101…`; a term still being typed will
        // not normalize and is matched as it stands.
        let phoneTerm = term;
        try {
            phoneTerm = normalizePhone(term);
        } catch {
            phoneTerm = term;
        }

        const needle = term.toLowerCase();

        return [...getDb().patients]
            .filter((row) => row.name.toLowerCase().includes(needle) || row.phone.includes(phoneTerm))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, input.limit ?? 25)
            .map(toPatient);
    },

    /**
     * Everyone on file under this number, oldest first. `phone` is not unique
     * on purpose — two siblings share a mother's number — so this answers with
     * a list and lets the desk decide.
     */
    byPhone(input: RouterInput['patient']['byPhone']): Patient[] {
        let phone: string;
        try {
            phone = normalizePhone(input.phone);
        } catch {
            return [];
        }

        return [...getDb().patients]
            .filter((row) => row.phone === phone)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map(toPatient);
    },

    recent(input: RouterInput['patient']['recent']): Dated<RouterOutput['patient']['recent']> {
        const rows = [...getDb().patients].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        return {
            patients: rows.slice(0, input.limit ?? 25).map(toPatient),
            total: rows.length,
        };
    },

    byId(input: RouterInput['patient']['byId']): PatientDetail {
        const db = getDb();
        const patient = requirePatient(input.id);

        const history: HistoryEntry[] = [...db.appointments]
            .filter((appointment) => appointment.patientId === input.id)
            .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
            .map((appointment) => {
                const visit = db.visits.find((row) => row.appointmentId === appointment.id) ?? null;

                const paidTotal = visit
                    ? db.payments
                          .filter((payment) => payment.visitId === visit.id)
                          .reduce((sum, payment) => sum + payment.amount, 0)
                    : 0;
                const chargedTotal = visit?.chargedTotal ?? 0;

                const procedures: HistoryProcedure[] = visit
                    ? db.visitProcedures
                          .filter((line) => line.visitId === visit.id)
                          .map((line) => ({
                              name: nameOf(line.procedureId),
                              quantity: line.quantity,
                              tooth: line.tooth,
                          }))
                    : db.appointmentProcedures
                          .filter((line) => line.appointmentId === appointment.id)
                          .sort((a, b) => a.sortOrder - b.sortOrder)
                          .map((line) => ({
                              name: nameOf(line.procedureId),
                              quantity: line.quantity,
                              tooth: line.tooth,
                          }));

                return {
                    appointmentId: appointment.id,
                    visitId: visit?.id ?? null,
                    ref: appointment.ref,
                    startsAt: appointment.startsAt,
                    status: appointment.status,
                    isOpeningBalance: appointment.isOpeningBalance,
                    checkedInAt: visit?.checkedInAt ?? null,
                    completedAt: visit?.completedAt ?? null,
                    computedTotal: visit?.computedTotal ?? 0,
                    chargedTotal,
                    paidTotal,
                    balance: chargedTotal - paidTotal,
                    procedures,
                };
            });

        return {
            patient: toPatient(patient),
            history,
            questionnaireGaps: customQuestionHandlers.auditAnswers(answersOf(patient)),
        };
    },

    create(input: RouterInput['patient']['create']): Patient {
        const custom = customQuestionHandlers.validateIntake(input.custom ?? {});

        const row = createMinimalPatient(input);
        row.custom = custom;

        save();
        return toPatient(row);
    },

    update(input: RouterInput['patient']['update']): Patient {
        const { id, ...patch } = input;
        const current = requirePatient(id);

        const custom = patch.custom
            ? customQuestionHandlers.validatePatch(answersOf(current), patch.custom)
            : undefined;

        assignDefined(current, patch, {
            ...(patch.phone ? { phone: normalizePhone(patch.phone) } : {}),
            ...(custom ? { custom } : {}),
        });

        save();
        return toPatient(current);
    },
};

function nameOf(procedureId: string): string {
    return getDb().procedureTypes.find((row) => row.id === procedureId)?.name ?? 'Procedure';
}
