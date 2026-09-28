import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { ERROR_CODE } from '@lustre/shared';
import { appointmentService } from '../src/modules/appointment/appointment.service.ts';
import { balanceService } from '../src/modules/balance/balance.service.ts';
import { migrationService } from '../src/modules/migration/migration.service.ts';
import { repairPatientRefs } from '../src/modules/migration/repair.ts';
import { patientService } from '../src/modules/patient/patient.service.ts';
import { settingsService } from '../src/modules/settings/settings.service.ts';
import { statsService } from '../src/modules/stats/stats.service.ts';
import { setupDatabase, sql, truncateAll } from './helpers/db.ts';
import { type Clinic, expectAppError, clinic as fixtures } from './helpers/factories.ts';

/**
 * Registering someone the clinic already had. There is one registration screen
 * and one procedure behind it — `patient.create` with its `old` block — and
 * two things about it are worth asserting; the rest is `patient.create` under
 * another name.
 *
 * 1. The number on the paper file is the number the record carries. Entering
 *    710 and finding 909 on the record is the bug this whole path exists to
 *    fix, and nothing about it is visible from inside the service: it is the
 *    `ref` column and what search can find.
 * 2. An opening balance is owed but was never billed here, so it has to land in
 *    `outstanding` and stay out of `summary`, `stats` and the day view. Get it
 *    wrong in either direction and either the doctor sees a fortune billed on a
 *    day the clinic was shut, or a patient is told they owe nothing when they
 *    owe 800.
 *
 * Atomicity is asserted through the failures rather than the successes: a
 * refused ref, a refused answer, a failed write. Each has to leave the
 * register exactly as it found it, patient included.
 */

/** Where the server dates an old patient's balance: the clinic's today. */
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
const OWED = 80_000;

/**
 * The clinic, set up the way Settings → Clinic sets it before a migration: a
 * next patient number above every number the old system used.
 * `PATIENT_REF_RESERVED` below is what happens without it.
 */
const NEXT_REF = 900;

async function migrating(): Promise<Clinic> {
    const clinic = await fixtures();
    await settingsService.update({
        patientRefNext: NEXT_REF,
    });
    return clinic;
}

describe('registering an old patient', () => {
    beforeAll(setupDatabase);
    beforeEach(truncateAll);

    test('keeps the number on the paper file as the patient ref', async () => {
        await migrating();

        const entered = await patientService.create({
            name: 'Mariam Fouad',
            phone: '01098765432',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: '710' },
        });

        expect(entered.ref).toBe('710');
        expect(entered.legacyRef).toBe('710');
    });

    // The report, exactly as it came in: an existing patient entered with old
    // ref 710 was created as 909, because the old flow allocated a number for
    // them on top of the one they already had.
    test('old ref 710 does not become 909', async () => {
        await migrating();
        await settingsService.update({ patientRefNext: 909 });

        const entered = await patientService.create({
            name: 'Existing Patient',
            phone: '01000000710',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: '710' },
        });

        expect(entered.ref).toBe('710');
        expect(entered.ref).not.toBe('909');

        // And the number nobody has had yet is still nobody's.
        expect((await settingsService.get()).patientRefNext).toBe(909);
    });

    test('does not advance the new-patient sequence', async () => {
        await migrating();
        await settingsService.update({ patientRefNext: 910 });

        await patientService.create({
            name: 'Old One',
            phone: '01000000701',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: '701' },
        });
        await patientService.create({
            name: 'Old Two',
            phone: '01000000702',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: '702' },
        });

        const fresh = await patientService.create({
            name: 'Brand New',
            phone: '01099999999',
            birthDate: '1990-01-01',
            custom: {},
        });
        expect(fresh.ref).toBe('910');
    });

    test('is found by the number written on the file', async () => {
        await migrating();

        await patientService.create({
            name: 'Rania Fahmy',
            phone: '01077777777',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: '710' },
        });

        const found = await patientService.search({ q: '710', limit: 25 });
        expect(found.map((row) => row.name)).toEqual(['Rania Fahmy']);
    });

    // The old system's format is its own, and refusing a real number for not
    // looking like a `ref` would be refusing the only thing that matches a
    // paper file to a record.
    test('takes a number that is not a number at all', async () => {
        await migrating();

        const entered = await patientService.create({
            name: 'Kamal Zaki',
            phone: '01088888888',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: 'A/1991-07' },
        });

        expect(entered.ref).toBe('A/1991-07');
        expect((await patientService.search({ q: '1991', limit: 25 })).map((r) => r.id)).toEqual([
            entered.id,
        ]);
    });

    test('refuses a number another patient already has, and writes nothing', async () => {
        await migrating();

        await patientService.create({
            name: 'First Here',
            phone: '01000000601',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: '601' },
        });

        await expectAppError(ERROR_CODE.PATIENT_REF_TAKEN, () =>
            patientService.create({
                name: 'Second Here',
                phone: '01000000602',
                birthDate: '1990-01-01',
                custom: {},
                old: { ref: '601' },
            }),
        );

        expect(await patientService.byPhone({ phone: '01000000602' })).toHaveLength(0);
    });

    // 9100 for 910 is the mis-key this refuses. Left alone it is a record that
    // cannot be kept: the sequence reaches 9100 eventually and refuses the *new*
    // patient, months later, for something typed today.
    test('refuses a number the new-patient sequence has still to reach', async () => {
        await migrating();
        await settingsService.update({ patientRefNext: 910 });

        await expectAppError(ERROR_CODE.PATIENT_REF_RESERVED, () =>
            patientService.create({
                name: 'Mis Keyed',
                phone: '01000009100',
                birthDate: '1990-01-01',
                custom: {},
                old: { ref: '9100' },
            }),
        );

        expect(await patientService.byPhone({ phone: '01000009100' })).toHaveLength(0);
        expect((await settingsService.get()).patientRefNext).toBe(910);
    });

    test('a registration that refuses the number does not use one up either', async () => {
        await migrating();
        await settingsService.update({ patientRefNext: 500 });

        await expectAppError(ERROR_CODE.PATIENT_REF_RESERVED, () =>
            patientService.create({
                name: 'Refused',
                phone: '01000000500',
                birthDate: '1990-01-01',
                custom: {},
                old: { ref: '500' },
            }),
        );

        const fresh = await patientService.create({
            name: 'After',
            phone: '01000000501',
            birthDate: '1990-01-01',
            custom: {},
        });
        expect(fresh.ref).toBe('500');
    });
});

describe('what an old patient brings with them', () => {
    beforeAll(setupDatabase);
    beforeEach(truncateAll);

    test('a patient with nothing carried over needs no cutoff configured', async () => {
        await fixtures();
        await settingsService.update({ patientRefNext: NEXT_REF });

        const entered = await patientService.create({
            name: 'Nothing Owed',
            phone: '01011110000',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: 'F-12' },
        });

        const { history } = await patientService.byId(entered.id);
        expect(history).toHaveLength(0);
    });

    // Settings → Clinic no longer asks for a cutoff: what they owe is owed from
    // the day it is entered.
    test('a balance needs no cutoff, and is dated the day it is entered', async () => {
        await fixtures();
        await settingsService.update({ patientRefNext: NEXT_REF });

        const entered = await patientService.create({
            name: 'No Cutoff',
            phone: '01011110001',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: '410', openingBalance: OWED },
        });

        const [row] = (await patientService.byId(entered.id)).history;
        expect(row?.isOpeningBalance).toBe(true);
        expect(row?.startsAt.toISOString()).toBe(`${TODAY}T12:00:00.000Z`);
        expect((await balanceService.outstanding()).total).toBe(OWED);
    });

    test('an opening balance is owed, but was never charged here', async () => {
        await migrating();

        const entered = await patientService.create({
            name: 'Hoda Nabil',
            phone: '01234567890',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: '311', openingBalance: OWED },
        });

        // Owed: the desk has to be able to ask for it.
        const outstanding = await balanceService.outstanding();
        expect(outstanding.total).toBe(OWED);
        expect(outstanding.patients.map((p) => p.patientId)).toContain(entered.id);

        // Not charged: nothing was billed on the day it was entered.
        const summary = await balanceService.summary({ from: TODAY, to: TODAY, offsetMinutes: 0 });
        expect(summary.charged).toBe(0);

        const stats = await statsService.summary({ from: TODAY, to: TODAY, offsetMinutes: 0 });
        expect(stats.appointments.total).toBe(0);
        expect(stats.visits.charged).toBe(0);
        // The one figure that does count it — it is still owed today.
        expect(stats.visits.outstanding).toBe(OWED);
    });

    test('a blank balance creates nothing to owe', async () => {
        await migrating();

        const entered = await patientService.create({
            name: 'Owes Nothing',
            phone: '01234500000',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: '312' },
        });

        const { history } = await patientService.byId(entered.id);
        expect(history).toHaveLength(0);
        expect((await balanceService.outstanding()).total).toBe(0);
    });

    test('the record shows the balance, flagged, so it is not read as a visit', async () => {
        await migrating();

        const entered = await patientService.create({
            name: 'Tarek Louis',
            phone: '01333333333',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: '313', openingBalance: OWED },
        });

        const { history } = await patientService.byId(entered.id);
        expect(history).toHaveLength(1);
        expect(history[0]?.isOpeningBalance).toBe(true);
        expect(history[0]?.isImported).toBe(false);
        expect(history[0]?.balance).toBe(OWED);
        expect(history[0]?.procedures).toEqual([]);
    });

    test('the day it was entered draws an empty schedule', async () => {
        await migrating();

        await patientService.create({
            name: 'Yasmin Adel',
            phone: '01222222222',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: '314', openingBalance: OWED },
        });

        expect(await appointmentService.byDate({ date: TODAY, offsetMinutes: 0 })).toHaveLength(0);
    });

    test('a whole session lands on one date without tripping the overlap constraint', async () => {
        await migrating();

        // Same cutoff, same instant, same branch — which is what the migration
        // actually looks like, and what `booked` would refuse outright.
        for (let i = 0; i < 25; i += 1) {
            await patientService.create({
                name: `Patient ${i}`,
                phone: `0100000${String(i).padStart(4, '0')}`,
                birthDate: '1990-01-01',
                custom: {},
                old: { ref: `M${i}`, openingBalance: 1_000 + i },
            });
        }

        const progress = await migrationService.progress();
        expect(progress.openingBalances).toBe(25);
        expect(progress.oldPatients).toBe(25);
        // The fixture patient is on file too, and did not come across.
        expect(progress.patients).toBe(26);
    });
});

/**
 * The half-written record is the outcome this whole path is shaped to prevent:
 * a patient on file owing nothing they actually owe is a wrong figure read out
 * at the desk months later, with no visit to check it against.
 */
describe('an old-patient registration is all or nothing', () => {
    beforeAll(setupDatabase);
    beforeEach(truncateAll);

    async function rowCounts() {
        const [counted] = await sql`
            SELECT
                (SELECT COUNT(*)::int FROM patients) AS patients,
                (SELECT COUNT(*)::int FROM appointments) AS appointments,
                (SELECT COUNT(*)::int FROM appointment_procedures) AS lines,
                (SELECT COUNT(*)::int FROM visits) AS visits
        `;
        return counted;
    }

    /**
     * The failure is injected at the database rather than mocked, because what
     * is being asserted is the transaction and not the code around it: the
     * patient row and its number are already written when the opening balance
     * is refused, and only a real `ROLLBACK` takes them back.
     */
    async function failNextInsertInto(table: 'patients' | 'visits'): Promise<void> {
        await sql.unsafe(`
            CREATE OR REPLACE FUNCTION test_refuse() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'refused by the test'; END $$ LANGUAGE plpgsql;
            CREATE TRIGGER test_refuse_insert BEFORE INSERT ON ${table}
            FOR EACH ROW EXECUTE FUNCTION test_refuse();
        `);
    }

    async function stopRefusing(table: 'patients' | 'visits'): Promise<void> {
        await sql.unsafe(`DROP TRIGGER IF EXISTS test_refuse_insert ON ${table}`);
    }

    test('a failed opening-balance write takes the patient and their number with it', async () => {
        await migrating();
        const before = await rowCounts();

        await failNextInsertInto('visits');
        try {
            await expect(
                patientService.create({
                    name: 'Ghost Entry',
                    phone: '01555555555',
                    birthDate: '1990-01-01',
                    custom: {},
                    old: { ref: '801', openingBalance: OWED },
                }),
            ).rejects.toThrow();
        } finally {
            await stopRefusing('visits');
        }

        expect(await rowCounts()).toEqual(before);
        expect(await patientService.byPhone({ phone: '01555555555' })).toHaveLength(0);
        // Nothing was allocated, because an old patient allocates nothing — and
        // the number a new patient is owed is still theirs.
        expect((await settingsService.get()).patientRefNext).toBe(NEXT_REF);
    });

    // A *new* patient, with no `old` block: the number is taken off the counter
    // first and the row inserted after, in one transaction. The insert failing
    // has to give the number back, or the next registration skips one.
    test('a failed write of a *new* patient hands their number back', async () => {
        await migrating();

        await failNextInsertInto('patients');
        try {
            await expect(
                patientService.create({
                    name: 'Ghost Entry',
                    phone: '01555555557',
                    birthDate: '1990-01-01',
                    custom: {},
                }),
            ).rejects.toThrow();
        } finally {
            await stopRefusing('patients');
        }

        expect((await settingsService.get()).patientRefNext).toBe(NEXT_REF);
        const fresh = await patientService.create({
            name: 'Next In',
            phone: '01555555558',
            birthDate: '1990-01-01',
            custom: {},
        });
        expect(fresh.ref).toBe(String(NEXT_REF));
    });

    test('a refused ref rolls back the balance with the patient', async () => {
        await migrating();

        await patientService.create({
            name: 'Holds The Number',
            phone: '01555550001',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: '802' },
        });

        const before = await rowCounts();

        await expectAppError(ERROR_CODE.PATIENT_REF_TAKEN, () =>
            patientService.create({
                name: 'Wants It Too',
                phone: '01555550002',
                birthDate: '1990-01-01',
                custom: {},
                old: { ref: '802', openingBalance: OWED },
            }),
        );

        expect(await rowCounts()).toEqual(before);
    });

    test('a refused questionnaire answer never reaches the register at all', async () => {
        await migrating();
        await sql`INSERT INTO custom_questions (id, key, label, kind, required)
                  VALUES (${Bun.randomUUIDv7()}, 'allergies', 'Allergies', 'text', true)`;

        const before = await rowCounts();

        await expectAppError(ERROR_CODE.CUSTOM_QUESTION_REQUIRED, () =>
            patientService.create({
                name: 'Unanswered',
                phone: '01555550003',
                birthDate: '1990-01-01',
                custom: {},
                old: { ref: '803', openingBalance: OWED },
            }),
        );

        expect(await rowCounts()).toEqual(before);
    });
});

describe('patient.byPhone', () => {
    beforeAll(setupDatabase);
    beforeEach(truncateAll);

    test('finds a stored E.164 number from what the desk types', async () => {
        await patientService.create({
            name: 'Dalia Hany',
            phone: '01012345678',
            birthDate: '1990-01-01',
            custom: {},
        });

        expect(await patientService.byPhone({ phone: '01012345678' })).toHaveLength(1);
        expect(await patientService.byPhone({ phone: '+201012345678' })).toHaveLength(1);
        expect(await patientService.byPhone({ phone: '0101 234 5678' })).toHaveLength(1);
    });

    test('a number still being typed is not a duplicate', async () => {
        expect(await patientService.byPhone({ phone: '010' })).toEqual([]);
        expect(await patientService.byPhone({ phone: '' })).toEqual([]);
    });

    test('two people on one number are both returned, oldest first', async () => {
        const first = await patientService.create({
            name: 'Amir Sobhy',
            phone: '01066666666',
            birthDate: '1990-01-01',
            custom: {},
        });
        const second = await patientService.create({
            name: 'Nour Sobhy',
            phone: '01066666666',
            birthDate: '1990-01-01',
            custom: {},
        });

        const found = await patientService.byPhone({ phone: '01066666666' });
        expect(found.map((p) => p.id)).toEqual([first.id, second.id]);
    });
});

/**
 * The records written before an old patient's ref was their own number: 710 on
 * the paper file, 909 on the screen. `bun db:repair-refs` is the way to run it;
 * the reasoning is in `src/modules/migration/repair.ts`.
 */
describe('repairing the records the old flow wrote', () => {
    beforeAll(setupDatabase);
    beforeEach(truncateAll);

    /** Exactly what `migration.enter` used to write: the old number stored, a fresh one on the record. */
    async function asTheOldFlowWrote(ref: string, oldRef: string, phone: string): Promise<string> {
        const id = Bun.randomUUIDv7();
        await sql`INSERT INTO patients (id, ref, name, phone, birth_date, legacy_ref)
                  VALUES (${id}, ${ref}, 'Migrated', ${phone}, '1990-01-01', ${oldRef})`;
        return id;
    }

    test('the reported 710/909 record gets 710 back, and is then found by it', async () => {
        await settingsService.update({ patientRefNext: 910 });
        const id = await asTheOldFlowWrote('909', '710', '+201000000710');

        const dry = await repairPatientRefs({ apply: false });
        expect(dry.repairable).toBe(1);
        // A dry run is a report and writes nothing.
        expect((await patientService.byId(id)).patient.ref).toBe('909');

        const done = await repairPatientRefs({ apply: true });
        expect(done.repairable).toBe(1);

        expect((await patientService.byId(id)).patient.ref).toBe('710');
        expect((await patientService.search({ q: '710', limit: 25 })).map((r) => r.id)).toEqual([id]);
    });

    // Two paper files carrying one number. Only the desk knows which record is
    // which patient, so neither is touched and both are reported.
    test('leaves a record alone when its old number is another patient’s ref', async () => {
        await settingsService.update({ patientRefNext: 910 });
        await sql`INSERT INTO patients (id, ref, name, phone, birth_date)
                  VALUES (${Bun.randomUUIDv7()}, '710', 'Already 710', '+201000000600', '1990-01-01')`;
        const clashing = await asTheOldFlowWrote('909', '710', '+201000000710');

        const report = await repairPatientRefs({ apply: true });
        expect(report.taken).toBe(1);
        expect(report.rows.find((row) => row.patientId === clashing)?.verdict).toBe('taken');
        expect((await patientService.byId(clashing)).patient.ref).toBe('909');
    });

    // The first record giving up 909 is what frees it for the second. Repairing
    // one at a time and re-reading would miss that; the set is carried through
    // the pass for exactly this.
    test('repairs a chain, where one record’s old number is another’s current ref', async () => {
        await settingsService.update({ patientRefNext: 910 });
        const first = await asTheOldFlowWrote('909', '710', '+201000000710');
        const second = await asTheOldFlowWrote('901', '909', '+201000000909');

        const report = await repairPatientRefs({ apply: true });
        expect(report.repairable).toBe(2);

        expect((await patientService.byId(first)).patient.ref).toBe('710');
        expect((await patientService.byId(second)).patient.ref).toBe('909');
    });

    test('leaves a record alone when its old number is one the sequence still owes', async () => {
        await settingsService.update({ patientRefNext: 910 });
        const ahead = await asTheOldFlowWrote('5', '9100', '+201000009100');

        const report = await repairPatientRefs({ apply: true });
        expect(report.reserved).toBe(1);
        expect((await patientService.byId(ahead)).patient.ref).toBe('5');
    });

    test('has nothing to do on a register registered the new way', async () => {
        await migrating();
        await patientService.create({
            name: 'Entered Properly',
            phone: '01000000711',
            birthDate: '1990-01-01',
            custom: {},
            old: { ref: '711' },
        });

        const report = await repairPatientRefs({ apply: true });
        expect(report.rows).toEqual([]);
    });

    test('is safe to run twice', async () => {
        await settingsService.update({ patientRefNext: 910 });
        await asTheOldFlowWrote('909', '710', '+201000000710');

        await repairPatientRefs({ apply: true });
        expect((await repairPatientRefs({ apply: true })).rows).toEqual([]);
    });
});
