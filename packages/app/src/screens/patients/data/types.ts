/**
 * The payload shapes this cluster reads, mirrored by hand from the server's
 * `patient` and `customQuestion` services (SPEC §5, §13).
 *
 * They are hand-written *only* because there is no tRPC client yet — SPEC §18
 * F2 has not landed, so `AppRouter` cannot be inferred from here and the app
 * package does not depend on the server package. Every field below matches
 * `patient.service.ts` and `customQuestion.service.ts` exactly. When the client
 * lands, this file is deleted and the types come from inference; see
 * `BLOCKED.md`.
 *
 * One difference from the server, and it is the transport's: `Date` columns
 * arrive as ISO strings over JSON, so they are typed as strings here.
 */

/**
 * SPEC §5. `date` is in the enum because the server accepts it — this cluster
 * deliberately does not render an editor for it yet (see `customFields.ts`).
 */
export type QuestionKind = 'text' | 'number' | 'boolean' | 'select' | 'date';

export interface CustomQuestion {
    id: string;
    /** The stable key into `patients.custom`. Never changes once answers exist. */
    key: string;
    label: string;
    kind: QuestionKind;
    /** Only meaningful for `select`. */
    options: string[] | null;
    required: boolean;
    sortOrder: number;
    /**
     * §7.8: one verb, deactivate. A question is never deleted, so its answers
     * survive on every record and come back if it is reactivated.
     */
    active: boolean;
}

/** Answers keyed by `custom_questions.key`, as stored in `patients.custom`. */
export type Answers = Record<string, unknown>;

export type QuestionnaireGapReason = 'unanswered' | 'answer_no_longer_valid';

/** What one record is missing against the questionnaire as it stands today. */
export interface QuestionnaireGap {
    key: string;
    label: string;
    required: boolean;
    reason: QuestionnaireGapReason;
}

export interface Patient {
    id: string;
    name: string;
    /** E.164, normalized on write. */
    phone: string;
    email: string | null;
    /** `YYYY-MM-DD`. */
    birthDate: string | null;
    gender: string | null;
    custom: Answers;
    notes: string | null;
    createdAt: string;
    /** Derived from `birthDate` at read time; never stored (§5). */
    age: number | null;
}

/** Money is integer piastres end to end (§9). Formatted only by `MoneyValue`. */
export interface PatientVisit {
    visitId: string;
    appointmentId: string;
    ref: string;
    startsAt: string;
    checkedInAt: string;
    completedAt: string | null;
    computedTotal: number;
    chargedTotal: number;
    paidTotal: number;
    /** `chargedTotal - paidTotal`. Derived, never stored (§10). */
    balance: number;
}

/** `patient.byId` — patient, history and questionnaire gaps in one payload (§13). */
export interface PatientDetail {
    patient: Patient;
    visits: PatientVisit[];
    questionnaireGaps: QuestionnaireGap[];
}

/** `balance.outstanding`, narrowed to what the patient list draws on a row. */
export interface PatientBalance {
    patientId: string;
    balance: number;
}

/** The subset of `patient.update`'s input this cluster sends. */
export interface UpdatePatientInput {
    id: string;
    /**
     * A partial patch. Only the keys sent are validated; a key sent blank
     * clears that answer. Keys left out keep whatever is stored, which is what
     * lets a record outlive a questionnaire that has moved on since.
     */
    custom?: Answers;
}
