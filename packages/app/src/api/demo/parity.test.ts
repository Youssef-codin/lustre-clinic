/**
 * The demo backend and the server agree on the rules they both apply.
 *
 * Each case runs the demo's handler and the server's service on the same input
 * and compares what comes back, errors included. The server side never reaches
 * Postgres: its `db` calls are stubbed to hand back the rows the demo holds, so
 * what is compared is the logic on top of the query and not the query itself.
 *
 * Written before the shared rules moved into `@lustre/shared`, against the two
 * copies, and kept afterwards: it goes through the public surface on both sides,
 * so it now checks that each side still calls the one copy, and calls it the
 * same way.
 */
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { DEFAULT_REMINDER_TEMPLATE, ERROR_CODE } from '@lustre/shared';

mock.module('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: () => Promise.resolve(null),
        setItem: () => Promise.resolve(),
        removeItem: () => Promise.resolve(),
        multiGet: () => Promise.resolve([]),
        multiSet: () => Promise.resolve(),
    },
}));

const { getDb, setDb } = await import('./db');
const { seedDemoDb } = await import('./seed');
const demoRules = await import('./rules');
const { customQuestionHandlers } = await import('./handlers/customQuestion');
const { reminderHandlers } = await import('./handlers/reminder');
const { settingsHandlers } = await import('./handlers/settings');

const { db } = await import('../../../../server/src/db/index.ts');
const serverMoney = await import('../../../../server/src/util/money.ts');
const serverTime = await import('../../../../server/src/util/time.ts');
const serverRef = await import('../../../../server/src/util/ref.ts');
const { customQuestionService } = await import(
    '../../../../server/src/modules/customQuestion/customQuestion.service.ts'
);
const { reminderService } = await import('../../../../server/src/modules/reminder/reminder.service.ts');
const { settingsService } = await import('../../../../server/src/modules/settings/settings.service.ts');

type Outcome =
    | { value: unknown }
    | { error: { name: string; code?: unknown; status?: unknown; message: string } };

/** What a call produced, with the two error classes reduced to what the client sees of them. */
async function outcome(run: () => unknown): Promise<Outcome> {
    try {
        return { value: await run() };
    } catch (err) {
        const error = err as Error & { code?: unknown; httpStatus?: unknown };
        return {
            error: {
                name: error.name === 'DemoError' || error.name === 'AppError' ? 'domain' : error.name,
                code: error.code,
                status: error.httpStatus,
                message: error.message,
            },
        };
    }
}

async function expectSame(demo: () => unknown, server: () => unknown): Promise<Outcome> {
    const fromDemo = await outcome(demo);
    expect(fromDemo).toEqual(await outcome(server));
    return fromDemo;
}

/** A drizzle query builder that ignores every clause and resolves to `rows`. */
function resolvingTo(rows: readonly unknown[]): never {
    const chain: unknown = new Proxy(() => {}, {
        get: (_target, key) =>
            key === 'then' ? (resolve: (value: unknown) => void) => resolve(rows) : () => chain,
    });
    return chain as never;
}

const stubs: { mockRestore: () => void }[] = [];

function stubSelect(...results: (readonly unknown[])[]): void {
    let call = 0;
    stubs.push(
        spyOn(db, 'select').mockImplementation(() => {
            const rows = results[Math.min(call, results.length - 1)] ?? [];
            call += 1;
            return resolvingTo(rows);
        }),
    );
}

beforeEach(() => {
    setDb(seedDemoDb());
});

afterEach(() => {
    for (const stub of stubs.splice(0)) stub.mockRestore();
});

// --- money --------------------------------------------------------------------

describe('money', () => {
    const lineSets = [
        [],
        [{ unitPrice: 20_000, quantity: 1, isCheckup: true }],
        [
            { unitPrice: 20_000, quantity: 1, isCheckup: true },
            { unitPrice: 150_000, quantity: 2, isCheckup: false },
        ],
        [
            { unitPrice: 20_000, quantity: 2, isCheckup: true },
            { unitPrice: 5_000, quantity: 1, isCheckup: true },
        ],
        [
            { unitPrice: 0, quantity: 3, isCheckup: false },
            { unitPrice: 99_999, quantity: 7, isCheckup: false },
        ],
    ];

    it('totals the same lines to the same piastres', async () => {
        for (const lines of lineSets) {
            await expectSame(
                () => demoRules.computeTotal(lines),
                () => serverMoney.computeTotal(lines),
            );
        }
    });

    it('accepts and refuses the same amounts', async () => {
        for (const amount of [
            0,
            1,
            100_000_000,
            100_000_001,
            -1,
            1.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
        ]) {
            await expectSame(
                () => demoRules.assertAmount(amount, 'paid'),
                () => serverMoney.assertAmount(amount, 'paid'),
            );
        }
    });
});

// --- time and refs ------------------------------------------------------------

describe('time', () => {
    it('derives the same age', async () => {
        const births = [
            null,
            '',
            'not a date',
            '1990-05-11',
            '2000-02-29',
            '2026-09-13',
            '2026-09-14',
            '2031-01-01',
        ];
        const days = [
            new Date('2026-09-13T12:00:00Z'),
            new Date('2027-02-28T00:00:00Z'),
            new Date('2027-03-01T00:00:00Z'),
        ];

        for (const birth of births) {
            for (const on of days) {
                await expectSame(
                    () => demoRules.ageFromBirthDate(birth, on),
                    () => serverTime.ageFromBirthDate(birth, on),
                );
            }
        }
    });

    it('draws the same day range', async () => {
        for (const date of ['2026-09-13', '2026-03-29', '2026-12-31', 'garbage']) {
            for (const offset of [0, 120, 180, -300]) {
                await expectSame(
                    () => demoRules.dayRange(date, offset),
                    () => serverTime.dayRange(date, offset),
                );
            }
        }
    });

    /**
     * The random part comes from `Math.random` on the demo and from
     * `crypto.getRandomValues` on the server. Both are pinned to draws that land
     * on the same alphabet index, so what is compared is everything around them:
     * the date part, the offset, and the order the characters are joined in.
     */
    it('builds the same refs from the same draws', async () => {
        let draw = 0;
        stubs.push(spyOn(Math, 'random').mockImplementation(() => ((draw++ % 31) + 0.5) / 31));
        let byte = 0;
        stubs.push(
            spyOn(crypto, 'getRandomValues').mockImplementation(
                <T extends ArrayBufferView | null>(array: T): T => {
                    const bytes = array as unknown as Uint8Array;
                    for (let i = 0; i < bytes.length; i += 1) bytes[i] = byte++ % 31;
                    return array;
                },
            ),
        );

        for (const at of [
            new Date('2026-09-13T21:30:00Z'),
            new Date('2026-12-31T23:59:00Z'),
            new Date('2000-01-01T00:00:00Z'),
        ]) {
            for (const offset of [0, 120, 180, -300]) {
                await expectSame(
                    () => demoRules.buildRef(at, offset),
                    () => serverRef.buildRef(at, offset),
                );
            }
        }
    });
});

// --- custom questions ---------------------------------------------------------

const QUESTIONS = [
    {
        id: 'q1',
        key: 'allergies',
        label: 'Allergies',
        labelAr: 'الحساسية',
        kind: 'text',
        options: null,
        required: true,
        sortOrder: 0,
        active: true,
    },
    {
        id: 'q2',
        key: 'visits',
        label: 'Visits a year',
        labelAr: null,
        kind: 'number',
        options: null,
        required: false,
        sortOrder: 1,
        active: true,
    },
    {
        id: 'q3',
        key: 'smoker',
        label: 'Smoker',
        labelAr: null,
        kind: 'boolean',
        options: null,
        required: false,
        sortOrder: 2,
        active: true,
    },
    {
        id: 'q4',
        key: 'last_xray',
        label: 'Last X-ray',
        labelAr: null,
        kind: 'date',
        options: null,
        required: false,
        sortOrder: 3,
        active: true,
    },
    {
        id: 'q5',
        key: 'referral',
        label: 'Referred by',
        labelAr: null,
        kind: 'select',
        options: ['friend', 'doctor'],
        required: true,
        sortOrder: 4,
        active: true,
    },
    {
        id: 'q6',
        key: 'insurer',
        label: 'Insurer',
        labelAr: null,
        kind: 'text',
        options: null,
        required: true,
        sortOrder: 5,
        active: false,
    },
] as const;

describe('custom questions', () => {
    beforeEach(() => {
        setDb({
            ...getDb(),
            customQuestions: QUESTIONS.map((row) => ({
                ...row,
                options: row.options ? [...row.options] : null,
            })),
        });
    });

    const complete = { allergies: 'penicillin', referral: 'friend' };

    const intakes: Record<string, unknown>[] = [
        complete,
        {},
        { allergies: 'none' },
        { ...complete, visits: '12' },
        { ...complete, visits: 3 },
        { ...complete, visits: 'many' },
        { ...complete, visits: Number.POSITIVE_INFINITY },
        { ...complete, smoker: false },
        { ...complete, smoker: 'no' },
        { ...complete, last_xray: '2026-02-28' },
        { ...complete, last_xray: '2026-02-30' },
        { ...complete, last_xray: '28/02/2026' },
        { ...complete, referral: 'billboard' },
        { ...complete, referral: '' },
        { ...complete, visits: '' },
        { ...complete, visits: null },
        { ...complete, insurer: '' },
        { ...complete, insurer: 'Axa' },
        { ...complete, shoe_size: 42 },
        { ...complete, allergies: 7 },
    ];

    it('takes and refuses the same intake', async () => {
        for (const answers of intakes) {
            stubSelect(QUESTIONS);
            await expectSame(
                () => customQuestionHandlers.validateIntake(answers),
                () => customQuestionService.validateIntake(answers),
            );
        }
    });

    const stored = { allergies: 'penicillin', referral: 'magazine', visits: 2, retired_key: 'x' };

    const patches: Record<string, unknown>[] = [
        {},
        { visits: 4 },
        { visits: '' },
        { allergies: '' },
        { insurer: '' },
        { referral: 'doctor' },
        { referral: 'magazine' },
        { retired_key: 'y' },
        { smoker: true, last_xray: '2025-01-01' },
    ];

    it('patches the same stored answers the same way', async () => {
        for (const patch of patches) {
            stubSelect(QUESTIONS);
            await expectSame(
                () => customQuestionHandlers.validatePatch(stored, patch),
                () => customQuestionService.validatePatch(stored, patch),
            );
        }
    });

    it('finds the same gaps in a record', async () => {
        const records: Record<string, unknown>[] = [
            {},
            stored,
            { ...complete, visits: 'soon', smoker: 1, last_xray: '2026-13-01' },
            { ...complete, visits: 1, smoker: true, last_xray: '2026-01-01', insurer: null },
        ];

        for (const record of records) {
            stubSelect(QUESTIONS.filter((row) => row.active));
            await expectSame(
                () => customQuestionHandlers.auditAnswers(record),
                () => customQuestionService.auditAnswers(record),
            );
        }
    });
});

// --- reminders ----------------------------------------------------------------

describe('reminder messages', () => {
    const templates = [
        DEFAULT_REMINDER_TEMPLATE,
        'Hi {{ name }} — {{clinic}} {{date}} {{time}} ({{ref}})',
        '{{nope}} and {{name}} and {{ clinic}}{{',
        'مرحبا {{name}}، موعدك في {{clinic}} يوم {{date}} الساعة {{time}} & ?#',
    ];

    it('renders the same message and WhatsApp link', async () => {
        const demo = getDb();
        const appointment = demo.appointments.find((row) => row.status === 'booked');
        if (!appointment) throw new Error('the seed has no booked appointment');
        const patient = demo.patients.find((row) => row.id === appointment.patientId);
        if (!patient) throw new Error('the booked appointment has no patient');

        patient.name = 'Nour & Sons ? #1';
        const dueAt = new Date(appointment.startsAt.getTime() - 3_600_000);
        demo.reminders = [
            { id: 'r1', appointmentId: appointment.id, dueAt, status: 'pending', sentAt: null },
        ];

        const joined = {
            id: 'r1',
            appointmentId: appointment.id,
            dueAt,
            startsAt: appointment.startsAt,
            ref: appointment.ref,
            status: appointment.status,
            patientId: patient.id,
            name: patient.name,
            phone: patient.phone,
        };

        for (const template of templates) {
            demo.settings.reminderTemplate = template;
            const row = { id: 1, ...demo.settings };

            for (const offsetMinutes of [0, 120, 180, -300]) {
                const input = { dueOnly: false, limit: 100, offsetMinutes };
                stubSelect([row], [joined]);
                const result = await expectSame(
                    () => reminderHandlers.pending(input),
                    () => reminderService.pending(input),
                );
                expect(result).toMatchObject({ value: [{ id: 'r1' }] });
                for (const stub of stubs.splice(0)) stub.mockRestore();
            }
        }
    });
});

// --- settings -----------------------------------------------------------------

describe('settings', () => {
    function serverRow() {
        return { id: 1, ...getDb().settings };
    }

    /**
     * `settings.update` on the server: read the row, then — inside the
     * transaction — lock it and read the numbered refs when the patient number
     * is being set, write the patch, and hand back what was written.
     */
    function stubUpdate(): void {
        const numbered = getDb()
            .patients.map((patient) => patient.ref)
            .filter((ref) => /^\d+$/.test(ref));
        stubSelect([serverRow()], [serverRow()], [{ refs: numbered }]);
        stubs.push(
            spyOn(db, 'transaction').mockImplementation(((run: (tx: unknown) => unknown) =>
                run(db)) as never),
        );
        stubs.push(
            spyOn(db, 'update').mockImplementation(
                () =>
                    ({
                        set: (values: object) => ({
                            where: () => ({ returning: async () => [{ ...serverRow(), ...values }] }),
                        }),
                    }) as never,
            ),
        );
    }

    it('reads the same settings off the same row', async () => {
        const demo = getDb();
        demo.settings.durationOptions = [45, 10, 30];
        demo.settings.reminderNotifyAt = '19:00:00';

        stubSelect([serverRow()]);
        await expectSame(
            () => settingsHandlers.get(),
            () => settingsService.get(),
        );
    });

    const updates = [
        { clinicName: 'Renamed' },
        { durationOptions: [30, 10, 30, 20] },
        { durationOptions: [15, 25] },
        { durationOptions: [15, 25], defaultDuration: 25 },
        { defaultDuration: 45 },
        { defaultDuration: 55 },
        { reminderNotifyAt: '08:15', reminderTemplate: 'Hello {{name}}' },
        // The seed numbers its patients 1…N and leaves the counter on N.
        { patientRefLast: seedDemoDb().patients.length },
        { patientRefLast: seedDemoDb().patients.length + 500 },
        { patientRefLast: seedDemoDb().patients.length - 1 },
        { patientRefLast: 0 },
        { patientRefLast: 0, defaultDuration: 55 },
    ];

    it('accepts and refuses the same updates', async () => {
        for (const input of updates) {
            setDb(seedDemoDb());
            const before = getDb().settings;
            before.durationOptions = [30, 10, 45, 20];

            stubUpdate();
            const server = await outcome(() => settingsService.update(input));
            for (const stub of stubs.splice(0)) stub.mockRestore();

            const demo = await outcome(() => settingsHandlers.update(input));

            const withoutStamp = (result: Outcome) =>
                'value' in result ? { value: { ...(result.value as object), updatedAt: null } } : result;
            expect(withoutStamp(demo)).toEqual(withoutStamp(server));
        }
    });

    it('refuses a default outside the offered durations with the same code', async () => {
        stubUpdate();
        const result = await expectSame(
            () => settingsHandlers.update({ defaultDuration: 55 }),
            () => settingsService.update({ defaultDuration: 55 }),
        );
        expect(result).toMatchObject({ error: { code: ERROR_CODE.INVALID_DURATION } });
    });
});
