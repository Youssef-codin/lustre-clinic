/**
 * Development seed exercising every state the UI renders. Destructive — deletes
 * every domain row before inserting, and refuses non-local databases unless
 * `--force` is passed. Prices are piastres (30_000 = 300 EGP). Times are
 * clinic-local via a fixed offset (CLINIC_OFFSET_MINUTES, Africa/Cairo summer);
 * omitting `visit.chargedTotal` charges the computed total (no discount).
 * Deletes run child-first; inserts put categories before their children for the
 * self-referencing `parent_id`.
 *
 * The hand-written bookings are the interesting ones — the awkward states the
 * UI has to render. A deterministic PRNG then fills the rest of the calendar so
 * the month reads like a working clinic: every open day of the current month
 * carries a full column, past ones settled, future ones booked with reminders
 * pending, and a few in next month so the calendar pages forward. The extra
 * patient roster exists so lists paginate, search has to disambiguate, and the
 * revenue figures come from more than a handful of rows. The clinic keeps the
 * same hours everywhere, so a booking written for a wall-clock time is inside
 * opening hours whichever weekday the seed happens to run on, and a booking's
 * branch is whichever one is open that day rather than the one written down.
 *
 * A booking's planned procedures (§7) come from `plan`; `type` is the
 * one-procedure shorthand the older fixtures use. A tooth-specific procedure
 * needs a tooth to satisfy §5, so the shorthand reuses the tooth the visit
 * actually recorded — the plan and the outcome agree — and falls back to a
 * fixed tooth for bookings that never reached the chair.
 *
 *   bun packages/server/scripts/seed.ts
 */

import {
    type AppointmentChannel,
    type AppointmentStatus,
    DEFAULT_DURATION_MINUTES,
    DEFAULT_REMINDER_LEAD_HOURS,
    DEFAULT_REMINDER_TEMPLATE,
    type PaymentMethod,
    type Tooth,
} from '@lustre/shared';
import { config } from '../src/config.ts';
import { db, sql } from '../src/db/index.ts';
import {
    appointmentProcedures,
    appointments,
    branches,
    clinicDays,
    customQuestions,
    patients,
    payments,
    procedureTypes,
    reminders,
    settings,
    visitProcedures,
    visits,
} from '../src/db/schema.ts';
import { logger } from '../src/logger.ts';
import { buildRef } from '../src/util/ref.ts';

const CLINIC_OFFSET_MINUTES = 180;

const id = () => Bun.randomUUIDv7();

const todayLocalMidnight = (() => {
    const now = new Date();
    const local = new Date(now.getTime() + CLINIC_OFFSET_MINUTES * 60_000);
    const utcMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    return new Date(utcMidnight - CLINIC_OFFSET_MINUTES * 60_000);
})();

function at(dayOffset: number, hhmm: string): Date {
    const [hours, minutes] = hhmm.split(':').map(Number);
    return new Date(
        todayLocalMidnight.getTime() +
            dayOffset * 86_400_000 +
            (hours ?? 0) * 3_600_000 +
            (minutes ?? 0) * 60_000,
    );
}

function isLocalDatabase(url: string): boolean {
    try {
        const { hostname } = new URL(url);
        return (
            hostname === 'localhost' || hostname === '127.0.0.1' || hostname === 'db' || hostname === '::1'
        );
    } catch {
        return false;
    }
}

if (!isLocalDatabase(config.DATABASE_URL) && !process.argv.includes('--force')) {
    logger.error('refusing to seed a non-local database; pass --force if that is really what you want');
    process.exit(1);
}

const mainBranch = {
    id: id(),
    name: 'Nasr City',
    address: '12 Abbas El Akkad, Nasr City, Cairo',
    active: true,
};
const secondBranch = { id: id(), name: 'Maadi', address: '9 Road 9, Maadi, Cairo', active: true };
const oldBranch = { id: id(), name: 'Heliopolis (closed)', address: null, active: false };

const days = [
    { weekday: 0, branchId: mainBranch.id, opensAt: '10:00', closesAt: '18:00' },
    { weekday: 1, branchId: mainBranch.id, opensAt: '10:00', closesAt: '18:00' },
    { weekday: 2, branchId: secondBranch.id, opensAt: '10:00', closesAt: '18:00' },
    { weekday: 3, branchId: mainBranch.id, opensAt: '10:00', closesAt: '18:00' },
    { weekday: 4, branchId: secondBranch.id, opensAt: '10:00', closesAt: '18:00' },
];

const cat = (name: string, sortOrder: number) => ({
    id: id(),
    parentId: null,
    name,
    defaultPrice: 0,
    hasQuantity: false,
    isToothSpecific: false,
    isCheckup: false,
    active: true,
    sortOrder,
});

const checkupCat = cat('Checkups', 0);
const restorativeCat = cat('Restorative', 1);
const surgicalCat = cat('Surgical', 2);
const cosmeticCat = cat('Cosmetic', 3);

const proc = (
    parent: { id: string },
    name: string,
    defaultPrice: number,
    opts: { tooth?: boolean; quantity?: boolean; checkup?: boolean; active?: boolean } = {},
    sortOrder = 0,
) => ({
    id: id(),
    parentId: parent.id,
    name,
    defaultPrice,
    hasQuantity: opts.quantity ?? false,
    isToothSpecific: opts.tooth ?? false,
    isCheckup: opts.checkup ?? false,
    active: opts.active ?? true,
    sortOrder,
});

const consultation = proc(checkupCat, 'Consultation', 30_000, { checkup: true }, 0);
const followUp = proc(checkupCat, 'Follow-up', 15_000, { checkup: true }, 1);
const xray = proc(checkupCat, 'Periapical x-ray', 20_000, { tooth: true, quantity: true }, 2);
const filling = proc(restorativeCat, 'Composite filling', 90_000, { tooth: true }, 0);
const rootCanal = proc(restorativeCat, 'Root canal treatment', 350_000, { tooth: true }, 1);
const crown = proc(restorativeCat, 'Zirconia crown', 600_000, { tooth: true }, 2);
const extraction = proc(surgicalCat, 'Simple extraction', 120_000, { tooth: true }, 0);
const surgicalExtraction = proc(surgicalCat, 'Surgical extraction', 250_000, { tooth: true }, 1);
const scaling = proc(cosmeticCat, 'Scaling and polishing', 80_000, {}, 0);
const whitening = proc(cosmeticCat, 'In-office whitening', 450_000, { active: false }, 1);

const procedures = [
    checkupCat,
    restorativeCat,
    surgicalCat,
    cosmeticCat,
    consultation,
    followUp,
    xray,
    filling,
    rootCanal,
    crown,
    extraction,
    surgicalExtraction,
    scaling,
    whitening,
];

const questions = [
    {
        id: id(),
        key: 'referral',
        label: 'How did you hear about us?',
        kind: 'select' as const,
        options: ['Friend', 'Instagram', 'Walk-by', 'Other'],
        required: false,
        sortOrder: 0,
        active: true,
    },
    {
        id: id(),
        key: 'allergies',
        label: 'Allergies',
        kind: 'text' as const,
        options: null,
        required: false,
        sortOrder: 1,
        active: true,
    },
    {
        id: id(),
        key: 'diabetic',
        label: 'Diabetic?',
        kind: 'boolean' as const,
        options: null,
        required: true,
        sortOrder: 2,
        active: true,
    },
    {
        id: id(),
        key: 'last_visit_elsewhere',
        label: 'Last dental visit elsewhere',
        kind: 'date' as const,
        options: null,
        required: false,
        sortOrder: 3,
        active: true,
    },
    {
        id: id(),
        key: 'systolic',
        label: 'Systolic BP',
        kind: 'number' as const,
        options: null,
        required: false,
        sortOrder: 4,
        active: true,
    },
    {
        id: id(),
        key: 'insurer',
        label: 'Insurer',
        kind: 'text' as const,
        options: null,
        required: false,
        sortOrder: 5,
        active: false,
    },
];

const patient = (
    name: string,
    phone: string,
    extra: Partial<{
        email: string | null;
        birthDate: string | null;
        gender: string | null;
        custom: Record<string, unknown>;
        notes: string | null;
        createdAt: Date;
    }> = {},
) => ({
    id: id(),
    name,
    phone,
    email: extra.email ?? null,
    birthDate: extra.birthDate ?? null,
    gender: extra.gender ?? null,
    custom: extra.custom ?? {},
    notes: extra.notes ?? null,
    createdAt: extra.createdAt ?? at(-120, '11:00'),
});

const nour = patient('Nour Abdelrahman', '+201001234567', {
    email: 'nour.abdelrahman@example.com',
    birthDate: '1991-04-12',
    gender: 'female',
    custom: { referral: 'Instagram', allergies: 'Penicillin', diabetic: false, systolic: 118 },
    notes: 'Prefers morning slots.',
});
const kareem = patient('Kareem Hassanein', '+201115550101', {
    email: 'kareem.h@example.com',
    birthDate: '1978-11-30',
    gender: 'male',
    custom: {
        referral: 'Friend',
        allergies: '',
        diabetic: true,
        last_visit_elsewhere: '2023-06-02',
        systolic: 145,
    },
    notes: 'Type 2 diabetic — confirm HbA1c before any extraction.',
});
const sara = patient('Sara Elmasry', '+201227778899', { createdAt: at(-2, '09:40') });
const yassin = patient('Yassin Tarek', '+201006661212', {
    birthDate: '2019-09-08',
    gender: 'male',
    custom: { referral: 'Friend', diabetic: false },
    notes: 'Comes with his mother. Nervous in the chair.',
});
const mona = patient('Mona Farid', '+201503334455', {
    email: 'mona.farid@example.com',
    birthDate: '1965-02-19',
    gender: 'female',
    custom: { referral: 'Walk-by', diabetic: false, systolic: 132 },
});
const omar = patient('Omar Sedky', '+201098765432', {
    birthDate: '2001-07-25',
    gender: 'male',
    custom: { referral: 'Instagram', diabetic: false },
});
const hoda = patient('Hoda Naguib', '+201212121212', { birthDate: '1988-01-03', gender: 'female' });
const laila = patient('Laila Mostafa', '+201555443322', {
    email: 'laila.m@example.com',
    gender: 'female',
    custom: { referral: 'Other', diabetic: false },
    createdAt: at(0, '09:15'),
});
const monaSecond = patient('Mona Abdelaziz', '+201004445566', { birthDate: '1995-12-01', gender: 'female' });

const roster = [
    ['Ahmed Zaki', '+201004001001', 'male', '1983-03-17'],
    ['Aya Mahmoud', '+201004001002', 'female', '1996-08-22'],
    ['Bassem Ghali', '+201004001003', 'male', '1971-05-05'],
    ['Dalia Sherif', '+201004001004', 'female', '1990-01-29'],
    ['Eslam Fathy', '+201004001005', 'male', '1999-10-14'],
    ['Farida Nabil', '+201004001006', 'female', '2005-06-30'],
    ['Gamal Roshdy', '+201004001007', 'male', '1958-12-11'],
    ['Habiba Selim', '+201004001008', 'female', '1993-02-08'],
    ['IbrahimShafik', '+201004001009', 'male', '1986-07-19'],
    ['Jailan Ezzat', '+201004001010', 'female', '2000-04-02'],
    ['Karim Nagy', '+201004001011', 'male', '1994-11-23'],
    ['Lamia Wahba', '+201004001012', 'female', '1969-09-01'],
    ['Mahmoud Sobhy', '+201004001013', 'male', '1981-06-16'],
    ['Nadia Kamel', '+201004001014', 'female', '1975-03-27'],
    ['Osama Rifaat', '+201004001015', 'male', '2003-01-09'],
    ['Passant Adel', '+201004001016', 'female', '1998-12-05'],
    ['Ramy Guindy', '+201004001017', 'male', '1989-04-21'],
    ['Salma Anis', '+201004001018', 'female', '2012-10-03'],
    ['Tarek Halim', '+201004001019', 'male', '1962-08-13'],
    ['Rana Bahgat', '+201004001020', 'female', '1997-05-26'],
    ['Wael Mansour', '+201004001021', 'male', '1979-02-14'],
    ['Yara Fahmy', '+201004001022', 'female', '2008-07-07'],
    ['Ziad Okasha', '+201004001023', 'male', '1992-09-18'],
    ['Amira Rashad', '+201004001024', 'female', '1985-11-11'],
    ['Hesham Bakr', '+201004001025', 'male', '1973-01-31'],
    ['Injy Shokry', '+201004001026', 'female', '2001-03-06'],
    ['Marwan Sabry', '+201004001027', 'male', '1996-06-24'],
    ['Nourhan Ismail', '+201004001028', 'female', '1991-10-09'],
    ['Mona Abdelrahman', '+201004001029', 'female', '1988-04-04'],
    ['Kareem Hassan', '+201004001030', 'male', '1984-12-19'],
    ['Omar Sedky', '+201004001031', 'male', '1966-02-02'],
] as const;

const rosterPatients = roster.map(([name, phone, gender, birthDate], index) =>
    patient(name, phone, {
        gender,
        birthDate,
        email: index % 3 === 0 ? `${name.split(' ')[0]?.toLowerCase()}.${index}@example.com` : null,
        custom:
            index % 4 === 0
                ? { referral: 'Friend', diabetic: false }
                : index % 4 === 1
                  ? { referral: 'Instagram', diabetic: false, systolic: 115 + (index % 30) }
                  : index % 4 === 2
                    ? { referral: 'Walk-by', diabetic: index % 8 === 2, allergies: 'Latex' }
                    : {},
        notes: index % 7 === 0 ? 'Referred by a family member.' : null,
        createdAt: at(-320 + index * 9, '11:00'),
    }),
);

const allPatients = [nour, kareem, sara, yassin, mona, omar, hoda, laila, monaSecond, ...rosterPatients];

interface Line {
    procedure: { id: string; defaultPrice: number };
    quantity?: number;
    unitPrice?: number;
    tooth?: Tooth;
    note?: string;
}

interface Booking {
    patient: { id: string };
    branch: { id: string };
    startsAt: Date;
    durationMinutes?: number;
    type?: { id: string; isToothSpecific: boolean };
    plan?: {
        procedure: { id: string; isToothSpecific: boolean };
        quantity?: number;
        tooth?: Tooth;
        note?: string;
    }[];
    status: AppointmentStatus;
    channel?: AppointmentChannel;
    note?: string;
    visit?: {
        checkedInAt: Date;
        completedAt?: Date;
        chargedTotal?: number;
        lines: Line[];
        payments?: { amount: number; method: PaymentMethod; methodNote?: string; paidAt: Date }[];
    };
    reminder?: { status: 'pending' | 'sent' | 'skipped'; sentAt?: Date };
}

const bookings: Booking[] = [
    {
        patient: kareem,
        branch: mainBranch,
        startsAt: at(-7, '10:30'),
        durationMinutes: 45,
        type: rootCanal,
        status: 'done',
        visit: {
            checkedInAt: at(-7, '10:26'),
            completedAt: at(-7, '11:20'),
            lines: [
                { procedure: consultation },
                { procedure: xray, quantity: 2, tooth: 'LR6' },
                { procedure: rootCanal, tooth: 'LR6', note: 'Session 1 of 2.' },
            ],
            payments: [{ amount: 400_000, method: 'visa', paidAt: at(-7, '11:22') }],
        },
    },
    {
        patient: mona,
        branch: mainBranch,
        startsAt: at(-7, '12:00'),
        durationMinutes: 30,
        type: scaling,
        status: 'done',
        visit: {
            checkedInAt: at(-7, '11:58'),
            completedAt: at(-7, '12:35'),
            lines: [{ procedure: scaling }, { procedure: consultation }],
            payments: [
                { amount: 60_000, method: 'cash', paidAt: at(-7, '12:36') },
                { amount: 50_000, method: 'instapay', paidAt: at(-5, '19:04') },
            ],
        },
    },
    {
        patient: yassin,
        branch: mainBranch,
        startsAt: at(-6, '11:00'),
        durationMinutes: 20,
        type: filling,
        status: 'done',
        note: 'Mother asked for the family rate.',
        visit: {
            checkedInAt: at(-6, '11:05'),
            completedAt: at(-6, '11:30'),
            chargedTotal: 90_000,
            lines: [
                { procedure: consultation },
                { procedure: filling, tooth: 'ULD', note: 'Deciduous, glass ionomer.' },
            ],
            payments: [{ amount: 90_000, method: 'cash', paidAt: at(-6, '11:31') }],
        },
    },
    {
        patient: omar,
        branch: secondBranch,
        startsAt: at(-5, '13:00'),
        durationMinutes: 60,
        type: crown,
        status: 'done',
        visit: {
            checkedInAt: at(-5, '13:10'),
            completedAt: at(-5, '14:15'),
            lines: [
                { procedure: crown, tooth: 'UR4' },
                { procedure: xray, tooth: 'UR4' },
            ],
            payments: [{ amount: 300_000, method: 'cash', paidAt: at(-5, '14:16') }],
        },
    },
    {
        patient: sara,
        branch: secondBranch,
        startsAt: at(-2, '12:30'),
        durationMinutes: 30,
        type: extraction,
        status: 'done',
        channel: 'walk_in',
        visit: {
            checkedInAt: at(-2, '12:28'),
            completedAt: at(-2, '13:05'),
            lines: [{ procedure: extraction, tooth: 'LL8' }, { procedure: consultation }],
        },
    },
    {
        patient: monaSecond,
        branch: mainBranch,
        startsAt: at(-3, '15:00'),
        durationMinutes: 30,
        type: followUp,
        status: 'done',
        visit: {
            checkedInAt: at(-3, '15:02'),
            completedAt: at(-3, '15:25'),
            lines: [{ procedure: followUp }],
            payments: [
                { amount: 15_000, method: 'other', methodNote: 'Bank transfer', paidAt: at(-3, '15:26') },
            ],
        },
    },
    { patient: hoda, branch: mainBranch, startsAt: at(-4, '16:00'), type: consultation, status: 'no_show' },
    {
        patient: nour,
        branch: mainBranch,
        startsAt: at(-4, '17:00'),
        type: scaling,
        status: 'cancelled',
        note: 'Cancelled the night before, travelling.',
    },

    {
        patient: mona,
        branch: mainBranch,
        startsAt: at(0, '10:00'),
        durationMinutes: 30,
        type: followUp,
        status: 'done',
        visit: {
            checkedInAt: at(0, '09:55'),
            completedAt: at(0, '10:28'),
            lines: [{ procedure: followUp }],
            payments: [{ amount: 15_000, method: 'cash', paidAt: at(0, '10:29') }],
        },
    },
    {
        patient: kareem,
        branch: mainBranch,
        startsAt: at(0, '11:00'),
        durationMinutes: 45,
        type: rootCanal,
        status: 'checked_in',
        note: 'Session 2 of 2.',
        visit: {
            checkedInAt: at(0, '10:58'),
            lines: [{ procedure: rootCanal, tooth: 'LR6', note: 'Session 2 of 2.' }],
        },
    },
    {
        patient: nour,
        branch: mainBranch,
        startsAt: at(0, '11:45'),
        durationMinutes: 30,
        type: filling,
        status: 'awaiting_payment',
        visit: {
            checkedInAt: at(0, '11:44'),
            lines: [
                { procedure: filling, tooth: 'UL5' },
                { procedure: xray, tooth: 'UL5' },
            ],
        },
    },
    {
        patient: laila,
        branch: mainBranch,
        startsAt: at(0, '12:30'),
        durationMinutes: 20,
        type: consultation,
        status: 'checked_in',
        channel: 'walk_in',
        visit: { checkedInAt: at(0, '12:26'), lines: [] },
    },
    {
        patient: omar,
        branch: mainBranch,
        startsAt: at(0, '14:00'),
        durationMinutes: 30,
        type: crown,
        status: 'booked',
        reminder: { status: 'sent', sentAt: at(-1, '19:02') },
    },
    {
        patient: sara,
        branch: mainBranch,
        startsAt: at(0, '15:00'),
        durationMinutes: 20,
        type: followUp,
        status: 'booked',
        reminder: { status: 'skipped' },
    },
    {
        patient: yassin,
        branch: mainBranch,
        startsAt: at(0, '16:30'),
        durationMinutes: 20,
        type: consultation,
        status: 'booked',
        note: 'Bring the panoramic from last year.',
        reminder: { status: 'sent', sentAt: at(-1, '19:03') },
    },
    { patient: hoda, branch: mainBranch, startsAt: at(0, '17:00'), type: consultation, status: 'cancelled' },

    {
        patient: nour,
        branch: mainBranch,
        startsAt: at(1, '10:00'),
        durationMinutes: 45,
        plan: [
            { procedure: consultation },
            { procedure: xray, quantity: 2, tooth: 'UL4' },
            { procedure: crown, tooth: 'UL4', note: 'Shade taken at the consult.' },
        ],
        status: 'booked',
        reminder: { status: 'pending' },
    },
    {
        patient: monaSecond,
        branch: mainBranch,
        startsAt: at(1, '11:00'),
        type: scaling,
        status: 'booked',
        reminder: { status: 'pending' },
    },
    {
        patient: kareem,
        branch: mainBranch,
        startsAt: at(1, '12:00'),
        durationMinutes: 20,
        type: followUp,
        status: 'booked',
        reminder: { status: 'sent', sentAt: at(0, '19:01') },
    },

    {
        patient: sara,
        branch: secondBranch,
        startsAt: at(2, '12:00'),
        durationMinutes: 30,
        type: consultation,
        status: 'booked',
        reminder: { status: 'pending' },
    },
    {
        patient: omar,
        branch: secondBranch,
        startsAt: at(2, '12:30'),
        durationMinutes: 30,
        plan: [
            { procedure: filling, tooth: 'LL6' },
            { procedure: filling, tooth: 'LL7' },
        ],
        status: 'booked',
        reminder: { status: 'pending' },
    },
    {
        patient: mona,
        branch: secondBranch,
        startsAt: at(2, '13:00'),
        durationMinutes: 30,
        type: filling,
        status: 'booked',
        reminder: { status: 'pending' },
    },
    {
        patient: yassin,
        branch: secondBranch,
        startsAt: at(2, '13:30'),
        durationMinutes: 30,
        type: followUp,
        status: 'booked',
        reminder: { status: 'pending' },
    },
    {
        patient: hoda,
        branch: secondBranch,
        startsAt: at(2, '14:00'),
        durationMinutes: 60,
        type: surgicalExtraction,
        status: 'booked',
        reminder: { status: 'pending' },
    },

    {
        patient: kareem,
        branch: mainBranch,
        startsAt: at(4, '10:00'),
        durationMinutes: 60,
        type: crown,
        status: 'booked',
        reminder: { status: 'pending' },
    },
    {
        patient: laila,
        branch: mainBranch,
        startsAt: at(9, '16:00'),
        durationMinutes: 45,
        type: rootCanal,
        status: 'booked',
        note: 'First treatment appointment.',
        reminder: { status: 'pending' },
    },
];

let randomState = 0x9e3779b9;
function random(): number {
    randomState = (randomState * 1_664_525 + 1_013_904_223) >>> 0;
    return randomState / 0x1_0000_0000;
}
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;

function localWeekday(dayOffset: number): number {
    return new Date(at(dayOffset, '00:00').getTime() + CLINIC_OFFSET_MINUTES * 60_000).getUTCDay();
}

const generatedRange = (() => {
    const local = new Date(todayLocalMidnight.getTime() + CLINIC_OFFSET_MINUTES * 60_000);
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();
    const dayOfMonth = local.getUTCDate();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return { first: 1 - dayOfMonth, last: daysInMonth - dayOfMonth };
})();

const treatments = [
    { type: consultation, minutes: 20, lines: [{ procedure: consultation }] },
    { type: followUp, minutes: 20, lines: [{ procedure: followUp }] },
    { type: scaling, minutes: 30, lines: [{ procedure: scaling }] },
    { type: filling, minutes: 30, lines: [{ procedure: consultation }, { procedure: filling }] },
    { type: extraction, minutes: 30, lines: [{ procedure: extraction }, { procedure: xray }] },
    { type: rootCanal, minutes: 45, lines: [{ procedure: consultation }, { procedure: rootCanal }] },
    { type: crown, minutes: 60, lines: [{ procedure: crown }, { procedure: xray }] },
    {
        type: surgicalExtraction,
        minutes: 60,
        lines: [{ procedure: surgicalExtraction }, { procedure: xray }],
    },
] as const;

const teeth: Tooth[] = ['UR6', 'UR4', 'UL5', 'UL7', 'LL6', 'LL8', 'LR6', 'LR4', 'ULD', 'LRE'];
const cashMethods: PaymentMethod[] = ['cash', 'cash', 'visa', 'instapay'];

function generateDay(dayOffset: number, dense = false, maxBookings = Number.POSITIVE_INFINITY): void {
    const weekday = localWeekday(dayOffset);
    const day = days.find((d) => d.weekday === weekday);
    if (!day) return; // Friday and Saturday: shut.

    const branch = day.branchId === mainBranch.id ? mainBranch : secondBranch;
    const [openHour] = day.opensAt.split(':').map(Number);
    const [closeHour] = day.closesAt.split(':').map(Number);
    const past = dayOffset < 0;

    let minute = (openHour ?? 10) * 60 + (dense || dayOffset === 0 ? 0 : Math.floor(random() * 30));
    const closingMinute = (closeHour ?? 18) * 60;

    const dayStart = at(dayOffset, '00:00').getTime();
    const takenSlots = bookings
        .filter((b) => b.startsAt.getTime() >= dayStart && b.startsAt.getTime() < dayStart + 86_400_000)
        .map((b) => {
            const start = (b.startsAt.getTime() - dayStart) / 60_000;
            return { start, end: start + (b.durationMinutes ?? DEFAULT_DURATION_MINUTES) };
        })
        .sort((a, b) => a.start - b.start);

    let placed = 0;
    while (minute + 20 <= closingMinute && placed < maxBookings) {
        const nextTaken = takenSlots
            .filter((slot) => slot.start >= minute)
            .reduce((soonest, slot) => Math.min(soonest, slot.start), closingMinute);
        const room = nextTaken - minute;

        const treatment = dense
            ? pick(treatments.filter((t) => t.minutes <= room && t.minutes <= 30))
            : pick(treatments.filter((t) => t.minutes <= room));

        if (!treatment) {
            const blocker = takenSlots.find((slot) => slot.start === nextTaken);
            minute = blocker ? blocker.end : closingMinute;
            continue;
        }

        const startsAt = at(
            dayOffset,
            `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
        );
        takenSlots.push({ start: minute, end: minute + treatment.minutes });

        const who = pick(allPatients);
        const lines: Line[] = treatment.lines.map((line) => ({
            procedure: line.procedure,
            tooth: line.procedure.isToothSpecific ? pick(teeth) : undefined,
        }));
        const roll = random();

        if (past) {
            if (!dense && roll < 0.06) {
                bookings.push({
                    patient: who,
                    branch,
                    startsAt,
                    durationMinutes: treatment.minutes,
                    type: treatment.type,
                    status: 'no_show',
                });
            } else if (!dense && roll < 0.11) {
                bookings.push({
                    patient: who,
                    branch,
                    startsAt,
                    durationMinutes: treatment.minutes,
                    type: treatment.type,
                    status: 'cancelled',
                });
            } else {
                const total = lines.reduce((sum, line) => sum + line.procedure.defaultPrice, 0);
                const charged = roll > 0.9 ? Math.round((total * 0.85) / 1_000) * 1_000 : total;
                const paid = roll < 0.2 ? Math.round((charged * 0.5) / 1_000) * 1_000 : charged;
                bookings.push({
                    patient: who,
                    branch,
                    startsAt,
                    durationMinutes: treatment.minutes,
                    type: treatment.type,
                    status: 'done',
                    channel: roll > 0.94 ? 'walk_in' : 'desk',
                    visit: {
                        checkedInAt: new Date(startsAt.getTime() - 4 * 60_000),
                        completedAt: new Date(startsAt.getTime() + treatment.minutes * 60_000),
                        chargedTotal: charged,
                        lines,
                        payments:
                            paid > 0
                                ? [
                                      {
                                          amount: paid,
                                          method: pick(cashMethods),
                                          methodNote: undefined,
                                          paidAt: new Date(
                                              startsAt.getTime() + (treatment.minutes + 2) * 60_000,
                                          ),
                                      },
                                  ]
                                : [],
                    },
                    reminder: { status: 'sent', sentAt: new Date(startsAt.getTime() - 20 * 3_600_000) },
                });
            }
        } else {
            bookings.push({
                patient: who,
                branch,
                startsAt,
                durationMinutes: treatment.minutes,
                type: treatment.type,
                status: !dense && roll < 0.05 ? 'cancelled' : 'booked',
                reminder: {
                    status: dayOffset <= 1 ? 'sent' : 'pending',
                    sentAt: dayOffset <= 1 ? at(-1, '19:00') : undefined,
                },
            });
        }

        placed += 1;
        minute += treatment.minutes + (!dense && random() < 0.25 ? 10 : 0);
    }
}

const fullDays = new Set([-6, 0, 1, 8]);

const quietDays = new Map([
    [-8, 2],
    [-1, 3],
    [2, 2],
    [5, 3],
    [9, 1],
    [12, 2],
    [16, 3],
]);

for (let offset = generatedRange.first; offset <= generatedRange.last; offset += 1) {
    if (offset === 3) continue;
    generateDay(offset, fullDays.has(offset), quietDays.get(offset) ?? Number.POSITIVE_INFINITY);
}

let scheduledNextMonth = 0;
for (
    let offset = generatedRange.last + 1;
    scheduledNextMonth < 4 && offset <= generatedRange.last + 25;
    offset += 3
) {
    const before = bookings.length;
    generateDay(offset);
    if (bookings.length > before) scheduledNextMonth += 1;
}

bookings.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

const usedRefs = new Set<string>();
function uniqueRef(startsAt: Date): string {
    let ref = buildRef(startsAt, CLINIC_OFFSET_MINUTES);
    while (usedRefs.has(ref)) ref = buildRef(startsAt, CLINIC_OFFSET_MINUTES);
    usedRefs.add(ref);
    return ref;
}

function branchOpenOn(startsAt: Date): { id: string } | undefined {
    const weekday = new Date(startsAt.getTime() + CLINIC_OFFSET_MINUTES * 60_000).getUTCDay();
    const day = days.find((d) => d.weekday === weekday);
    return day?.branchId === secondBranch.id ? secondBranch : day ? mainBranch : undefined;
}

const appointmentRows: (typeof appointments.$inferInsert)[] = [];
const planRows: (typeof appointmentProcedures.$inferInsert)[] = [];
const visitRows: (typeof visits.$inferInsert)[] = [];
const lineRows: (typeof visitProcedures.$inferInsert)[] = [];
const paymentRows: (typeof payments.$inferInsert)[] = [];
const reminderRows: (typeof reminders.$inferInsert)[] = [];

for (const booking of bookings) {
    const appointmentId = id();
    const durationMinutes = booking.durationMinutes ?? DEFAULT_DURATION_MINUTES;

    appointmentRows.push({
        id: appointmentId,
        ref: uniqueRef(booking.startsAt),
        patientId: booking.patient.id,
        branchId: branchOpenOn(booking.startsAt)?.id ?? booking.branch.id,
        startsAt: booking.startsAt,
        durationMinutes,
        note: booking.note ?? null,
        status: booking.status,
        channel: booking.channel ?? 'desk',
        createdAt: new Date(booking.startsAt.getTime() - 3 * 86_400_000),
        updatedAt: booking.startsAt,
    });

    const plan =
        booking.plan ??
        (booking.type
            ? [
                  {
                      procedure: booking.type,
                      tooth: booking.type.isToothSpecific
                          ? (booking.visit?.lines.find((l) => l.procedure.id === booking.type?.id)?.tooth ??
                            ('UR6' as Tooth))
                          : undefined,
                  },
              ]
            : []);

    plan.forEach((line, i) => {
        planRows.push({
            id: id(),
            appointmentId,
            procedureId: line.procedure.id,
            quantity: line.quantity ?? 1,
            tooth: line.tooth ?? null,
            note: line.note ?? null,
            sortOrder: i,
        });
    });

    if (booking.visit) {
        const visitId = id();
        const computedTotal = booking.visit.lines.reduce(
            (sum, line) => sum + (line.unitPrice ?? line.procedure.defaultPrice) * (line.quantity ?? 1),
            0,
        );

        visitRows.push({
            id: visitId,
            appointmentId,
            checkedInAt: booking.visit.checkedInAt,
            pricedAt: booking.visit.lines.length > 0 ? booking.visit.checkedInAt : null,
            completedAt: booking.visit.completedAt ?? null,
            computedTotal,
            chargedTotal: booking.visit.chargedTotal ?? computedTotal,
            createdAt: booking.visit.checkedInAt,
        });

        for (const line of booking.visit.lines) {
            lineRows.push({
                id: id(),
                visitId,
                procedureId: line.procedure.id,
                quantity: line.quantity ?? 1,
                unitPrice: line.unitPrice ?? line.procedure.defaultPrice,
                tooth: line.tooth ?? null,
                note: line.note ?? null,
            });
        }

        for (const payment of booking.visit.payments ?? []) {
            paymentRows.push({
                id: id(),
                visitId,
                amount: payment.amount,
                method: payment.method,
                methodNote: payment.methodNote ?? null,
                paidAt: payment.paidAt,
            });
        }
    }

    if (booking.reminder) {
        reminderRows.push({
            id: id(),
            appointmentId,
            dueAt: new Date(booking.startsAt.getTime() - DEFAULT_REMINDER_LEAD_HOURS * 3_600_000),
            status: booking.reminder.status,
            sentAt: booking.reminder.sentAt ?? null,
        });
    }
}

await db.transaction(async (tx) => {
    await tx.delete(payments);
    await tx.delete(visitProcedures);
    await tx.delete(visits);
    await tx.delete(reminders);
    await tx.delete(appointmentProcedures);
    await tx.delete(appointments);
    await tx.delete(clinicDays);
    await tx.delete(patients);
    await tx.delete(procedureTypes);
    await tx.delete(customQuestions);
    await tx.delete(branches);

    await tx.insert(branches).values([mainBranch, secondBranch, oldBranch]);
    await tx.insert(clinicDays).values(days);
    await tx.insert(procedureTypes).values(procedures);
    await tx.insert(customQuestions).values(questions);
    await tx.insert(patients).values(allPatients);
    await tx.insert(appointments).values(appointmentRows);
    if (planRows.length > 0) await tx.insert(appointmentProcedures).values(planRows);
    await tx.insert(visits).values(visitRows);
    if (lineRows.length > 0) await tx.insert(visitProcedures).values(lineRows);
    if (paymentRows.length > 0) await tx.insert(payments).values(paymentRows);
    await tx.insert(reminders).values(reminderRows);

    await tx
        .insert(settings)
        .values({
            id: 1,
            clinicName: 'Lustre Clinic',
            clinicPhone: '+20223456789',
            reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
        })
        .onConflictDoUpdate({
            target: settings.id,
            set: { clinicName: 'Lustre Clinic', clinicPhone: '+20223456789', updatedAt: new Date() },
        });
});

logger.info(
    {
        branches: 3,
        patients: allPatients.length,
        appointments: appointmentRows.length,
        visits: visitRows.length,
        payments: paymentRows.length,
        reminders: reminderRows.length,
    },
    'seeded',
);

await sql.end();
