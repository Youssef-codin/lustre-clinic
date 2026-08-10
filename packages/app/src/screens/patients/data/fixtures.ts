import type { Answers, CustomQuestion, Patient, PatientVisit } from './types';

/**
 * Seed data for `_LocalPatientsApi`. It exists to exercise the states the
 * screens have to survive, not to look plausible:
 *
 * - Arabic and Latin names in one list (§6 — the face is per string, and
 *   `<Text>` decides it, so nothing here sets one).
 * - A questionnaire holding every answer type the record renders, plus a
 *   `date` question the record deliberately does not yet edit, plus a
 *   deactivated one whose answers are still stored (§7.8).
 * - Patients that answered the questionnaire fully, partly, and not at all.
 * - Visits with a balance, settled visits, and a patient with no visits.
 */

/** Piastres (§9). 260000 is EGP 2,600. */
const EGP = 100;

export const CUSTOM_QUESTIONS: CustomQuestion[] = [
    {
        id: 'q-blood',
        key: 'blood_type',
        label: 'Blood type',
        kind: 'select',
        options: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
        required: true,
        sortOrder: 10,
        active: true,
    },
    {
        id: 'q-diabetic',
        key: 'diabetic',
        label: 'Diabetic',
        kind: 'boolean',
        options: null,
        required: true,
        sortOrder: 20,
        active: true,
    },
    {
        // An Arabic label sitting in the same list as Latin ones. The clinic
        // types the question in whichever language it asks it in.
        id: 'q-chronic',
        key: 'chronic_conditions',
        label: 'الأمراض المزمنة',
        kind: 'text',
        options: null,
        required: false,
        sortOrder: 30,
        active: true,
    },
    {
        id: 'q-allergies',
        key: 'allergies',
        label: 'Allergies',
        kind: 'text',
        options: null,
        required: false,
        sortOrder: 40,
        active: true,
    },
    {
        id: 'q-weight',
        key: 'weight_kg',
        label: 'Weight (kg)',
        kind: 'number',
        options: null,
        required: false,
        sortOrder: 50,
        active: true,
    },
    {
        // Accepted by the server, not yet editable here (§7.9). On the record
        // it renders read-only rather than disappearing or crashing.
        id: 'q-xray',
        key: 'last_xray',
        label: 'Last x-ray',
        kind: 'date',
        options: null,
        required: false,
        sortOrder: 60,
        active: true,
    },
    {
        // Deactivated, not deleted. Two patients below still hold an answer to
        // it; the record must not show it, and saving must not drop it.
        id: 'q-insurance',
        key: 'insurance_provider',
        label: 'Insurance provider',
        kind: 'text',
        options: null,
        required: false,
        sortOrder: 70,
        active: false,
    },
];

function patient(
    id: string,
    name: string,
    phone: string,
    extra: Partial<Patient> & { custom?: Answers } = {},
): Patient {
    return {
        id,
        name,
        phone,
        email: null,
        birthDate: null,
        gender: null,
        custom: {},
        notes: null,
        createdAt: '2026-01-04T09:00:00.000Z',
        age: null,
        ...extra,
    };
}

export const PATIENTS: Patient[] = [
    patient('p-1', 'نور الهدى عبد الرحمن', '+201001234567', {
        birthDate: '1991-03-18',
        gender: 'female',
        age: 35,
        createdAt: '2024-02-11T08:30:00.000Z',
        custom: {
            blood_type: 'A+',
            diabetic: false,
            chronic_conditions: 'ضغط الدم',
            allergies: 'Penicillin',
            weight_kg: 68,
            last_xray: '2025-11-02',
            // Answered before the question was deactivated. Preserved, hidden.
            insurance_provider: 'MedNet',
        },
    }),
    patient('p-2', 'Mariam Fathy', '+201118887766', {
        birthDate: '1998-07-02',
        gender: 'female',
        age: 28,
        createdAt: '2025-06-21T11:15:00.000Z',
        // Registered before `weight_kg` and `last_xray` were added: two gaps.
        custom: { blood_type: 'O+', diabetic: true, allergies: 'None' },
    }),
    patient('p-3', 'أحمد سيد الشناوي', '+201227776655', {
        birthDate: '1976-12-30',
        gender: 'male',
        age: 49,
        createdAt: '2023-09-02T14:00:00.000Z',
        custom: {
            blood_type: 'B+',
            diabetic: true,
            chronic_conditions: 'السكري من النوع الثاني',
            weight_kg: 91,
            insurance_provider: 'Allianz',
        },
    }),
    patient('p-4', 'Karim Doss', '+201555444333', {
        birthDate: '2003-05-09',
        gender: 'male',
        age: 23,
        createdAt: '2026-07-30T10:05:00.000Z',
        // Booked over the phone, never sat down with the questionnaire.
        custom: {},
    }),
    patient('p-5', 'فاطمة الزهراء منصور', '+201099887711', {
        birthDate: '1965-01-25',
        gender: 'female',
        age: 61,
        createdAt: '2022-11-14T09:45:00.000Z',
        custom: {
            blood_type: 'AB-',
            diabetic: false,
            allergies: 'لاتكس',
            weight_kg: 74,
            last_xray: '2024-04-19',
        },
    }),
    patient('p-6', 'Youssef Anwar', '+201234567890', {
        birthDate: '1989-08-14',
        gender: 'male',
        age: 36,
        createdAt: '2025-03-08T16:20:00.000Z',
        custom: {
            // The option 'AB' was renamed to 'AB+' after this was answered, so
            // today's questionnaire would not accept it: an invalid-answer gap.
            blood_type: 'AB',
            diabetic: false,
            weight_kg: 80,
        },
    }),
    patient('p-7', 'هالة صبري', '+201066554433', {
        birthDate: '1994-10-11',
        gender: 'female',
        age: 31,
        createdAt: '2026-02-19T13:10:00.000Z',
        custom: { blood_type: 'O-', diabetic: false, allergies: 'None', weight_kg: 59 },
    }),
    patient('p-8', 'Peter Ghattas', '+201007778899', {
        birthDate: '1958-04-03',
        gender: 'male',
        age: 68,
        createdAt: '2021-05-30T08:00:00.000Z',
        custom: { blood_type: 'A-', diabetic: true, chronic_conditions: 'Hypertension', weight_kg: 84 },
    }),
    patient('p-9', 'ليلى مصطفى', '+201144556677', {
        birthDate: '2016-06-22',
        gender: 'female',
        age: 10,
        createdAt: '2026-05-02T12:40:00.000Z',
        custom: { blood_type: 'B-', diabetic: false },
    }),
    patient('p-10', 'Omar Sabry', '+201033221100', {
        birthDate: '1985-02-17',
        gender: 'male',
        age: 41,
        createdAt: '2024-10-09T15:25:00.000Z',
        custom: { blood_type: 'O+', diabetic: false, allergies: 'Ibuprofen', weight_kg: 88 },
    }),
];

function visit(
    id: string,
    patientId: string,
    ref: string,
    startsAt: string,
    charged: number,
    paid: number,
): PatientVisit & { patientId: string } {
    return {
        patientId,
        visitId: id,
        appointmentId: `a-${id}`,
        ref,
        startsAt,
        checkedInAt: startsAt,
        completedAt: startsAt,
        computedTotal: charged,
        chargedTotal: charged,
        paidTotal: paid,
        balance: charged - paid,
    };
}

/** Newest first, the order `patient.byId` returns them in. */
export const VISITS: Array<PatientVisit & { patientId: string }> = [
    visit('v-1', 'p-1', '120726-K4M9', '2026-07-12T09:30:00.000Z', 2700 * EGP, 1200 * EGP),
    visit('v-2', 'p-1', '030526-P7QW', '2026-05-03T11:00:00.000Z', 300 * EGP, 300 * EGP),
    visit('v-3', 'p-1', '221125-T3XR', '2025-11-22T10:15:00.000Z', 4200 * EGP, 4200 * EGP),
    visit('v-4', 'p-3', '180626-B8ND', '2026-06-18T13:45:00.000Z', 5700 * EGP, 2000 * EGP),
    visit('v-5', 'p-3', '090924-R2VK', '2024-09-09T09:00:00.000Z', 300 * EGP, 300 * EGP),
    visit('v-6', 'p-5', '270626-M5HC', '2026-06-27T16:30:00.000Z', 1500 * EGP, 1500 * EGP),
    visit('v-7', 'p-8', '140326-W9JF', '2026-03-14T08:45:00.000Z', 900 * EGP, 0),
    visit('v-8', 'p-2', '020826-D6ZP', '2026-08-02T12:00:00.000Z', 300 * EGP, 300 * EGP),
    visit('v-9', 'p-10', '110126-N4TG', '2026-01-11T14:20:00.000Z', 2700 * EGP, 2700 * EGP),
];
