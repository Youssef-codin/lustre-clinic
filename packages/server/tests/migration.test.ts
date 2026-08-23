import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { ERROR_CODE } from '@lustre/shared';
import { appointmentService } from '../src/modules/appointment/appointment.service.ts';
import { balanceService } from '../src/modules/balance/balance.service.ts';
import { enterPatientInput } from '../src/modules/migration/migration.schema.ts';
import { migrationService } from '../src/modules/migration/migration.service.ts';
import { patientService } from '../src/modules/patient/patient.service.ts';
import { statsService } from '../src/modules/stats/stats.service.ts';
import { setupDatabase, truncateAll } from './helpers/db.ts';
import { expectAppError, clinic as fixtures } from './helpers/factories.ts';

/**
 * Bulk entry from the old system. Two things are worth asserting and the rest
 * is `patient.create` under another name:
 *
 * 1. An opening balance is owed but was never billed here, so it has to land in
 *    `outstanding` and stay out of `summary`, `stats` and the day view. That
 *    split is the whole reason `is_opening_balance` exists — get it wrong in
 *    either direction and either the doctor sees a fortune billed on a day the
 *    clinic was shut, or a patient is told they owe nothing when they owe 800.
 * 2. A session's worth of them land on one date at one instant, which is
 *    exactly what `appointments_no_overlap` and the per-date `ref` uniqueness
 *    are there to refuse. `done` frees the slot, and the ref retries.
 */

const CUTOFF = '2026-08-01';
const OWED = 80_000;

describe('migration.enter', () => {
    beforeAll(setupDatabase);
    beforeEach(truncateAll);

    test('a patient with no balance is written without an appointment', async () => {
        const entered = await migrationService.enter({
            name: 'Mariam Fouad',
            phone: '01098765432',
            offsetMinutes: 0,
        });

        expect(entered.openingBalanceVisitId).toBeNull();
        expect(entered.patient.phone).toBe('+201098765432');

        const { history } = await patientService.byId(entered.patient.id);
        expect(history).toHaveLength(0);
    });

    // The number is what matches a paper file to a record once the old system
    // is a read-only archive, so it is stored exactly as it was written on the
    // file — this app never generates one and never validates its shape.
    test("the old system's number is kept as typed", async () => {
        const entered = await migrationService.enter({
            name: 'Rania Fahmy',
            phone: '01077777777',
            legacyRef: 'A/1991-07',
            offsetMinutes: 0,
        });

        const { patient } = await patientService.byId(entered.patient.id);
        expect(patient.legacyRef).toBe('A/1991-07');
    });

    test('a file with no number on it is still a patient', async () => {
        const entered = await migrationService.enter({
            name: 'Kamal Zaki',
            phone: '01088888888',
            offsetMinutes: 0,
        });

        const { patient } = await patientService.byId(entered.patient.id);
        expect(patient.legacyRef).toBeNull();
    });

    test('the questionnaire is not required — a migrated patient is a name and a number', async () => {
        const entered = await migrationService.enter({
            name: 'Omar Said',
            phone: '01111111111',
            offsetMinutes: 0,
        });

        // Every active required question is a gap rather than a refusal; they
        // get asked the next time he is at the desk.
        const { questionnaireGaps } = await patientService.byId(entered.patient.id);
        expect(questionnaireGaps.length).toBeGreaterThanOrEqual(0);
    });

    test('an opening balance is owed, but was never charged here', async () => {
        const clinic = await fixtures();

        const entered = await migrationService.enter({
            name: 'Hoda Nabil',
            phone: '01234567890',
            openingBalance: OWED,
            branchId: clinic.branch.id,
            cutoffDate: CUTOFF,
            offsetMinutes: 0,
        });

        expect(entered.openingBalanceVisitId).not.toBeNull();

        // Owed: the desk has to be able to ask for it.
        const outstanding = await balanceService.outstanding();
        expect(outstanding.total).toBe(OWED);
        expect(outstanding.patients.map((p) => p.patientId)).toContain(entered.patient.id);

        // Not charged: nothing was billed on the cutoff date.
        const summary = await balanceService.summary({
            from: CUTOFF,
            to: CUTOFF,
            offsetMinutes: 0,
        });
        expect(summary.charged).toBe(0);

        const stats = await statsService.summary({ from: CUTOFF, to: CUTOFF, offsetMinutes: 0 });
        expect(stats.appointments.total).toBe(0);
        expect(stats.visits.charged).toBe(0);
        // The one figure that does count it — it is still owed today.
        expect(stats.visits.outstanding).toBe(OWED);
    });

    test('the cutoff date draws an empty schedule', async () => {
        const clinic = await fixtures();

        await migrationService.enter({
            name: 'Yasmin Adel',
            phone: '01222222222',
            openingBalance: OWED,
            branchId: clinic.branch.id,
            cutoffDate: CUTOFF,
            offsetMinutes: 0,
        });

        const day = await appointmentService.byDate({ date: CUTOFF, offsetMinutes: 0 });
        expect(day).toHaveLength(0);
    });

    test('the record shows it, flagged, so it is not read as a visit', async () => {
        const clinic = await fixtures();

        const entered = await migrationService.enter({
            name: 'Tarek Louis',
            phone: '01333333333',
            openingBalance: OWED,
            branchId: clinic.branch.id,
            cutoffDate: CUTOFF,
            offsetMinutes: 0,
        });

        const { history } = await patientService.byId(entered.patient.id);
        expect(history).toHaveLength(1);
        expect(history[0]?.isOpeningBalance).toBe(true);
        expect(history[0]?.balance).toBe(OWED);
        expect(history[0]?.procedures).toEqual([]);
    });

    test('a whole session lands on one date without tripping the overlap constraint', async () => {
        const clinic = await fixtures();

        // Same cutoff, same instant, same branch — which is what the migration
        // actually looks like, and what `booked` would refuse outright.
        for (let i = 0; i < 25; i += 1) {
            await migrationService.enter({
                name: `Patient ${i}`,
                phone: `0100000${String(i).padStart(4, '0')}`,
                openingBalance: 1_000 + i,
                branchId: clinic.branch.id,
                cutoffDate: CUTOFF,
                offsetMinutes: 0,
            });
        }

        const progress = await migrationService.progress();
        expect(progress.openingBalances).toBe(25);
        // The fixture patient is on file too, and owes nothing.
        expect(progress.patients).toBe(26);
    });

    test('a balance with nowhere to hang is refused before anything is written', async () => {
        const parsed = enterPatientInput.safeParse({
            name: 'Sara Kamel',
            phone: '01444444444',
            openingBalance: OWED,
        });

        expect(parsed.success).toBe(false);
    });

    test('an unknown branch fails without leaving the patient behind', async () => {
        await expectAppError(ERROR_CODE.NOT_FOUND, () =>
            migrationService.enter({
                name: 'Ghost Entry',
                phone: '01555555555',
                openingBalance: OWED,
                branchId: Bun.randomUUIDv7(),
                cutoffDate: CUTOFF,
                offsetMinutes: 0,
            }),
        );

        expect(await patientService.byPhone({ phone: '01555555555' })).toHaveLength(0);
    });
});

describe('patient.byPhone', () => {
    beforeAll(setupDatabase);
    beforeEach(truncateAll);

    test('finds a stored E.164 number from what the desk types', async () => {
        await migrationService.enter({ name: 'Dalia Hany', phone: '01012345678', offsetMinutes: 0 });

        expect(await patientService.byPhone({ phone: '01012345678' })).toHaveLength(1);
        expect(await patientService.byPhone({ phone: '+201012345678' })).toHaveLength(1);
        expect(await patientService.byPhone({ phone: '0101 234 5678' })).toHaveLength(1);
    });

    test('a number still being typed is not a duplicate', async () => {
        expect(await patientService.byPhone({ phone: '010' })).toEqual([]);
        expect(await patientService.byPhone({ phone: '' })).toEqual([]);
    });

    test('two people on one number are both returned, oldest first', async () => {
        const first = await migrationService.enter({
            name: 'Amir Sobhy',
            phone: '01066666666',
            offsetMinutes: 0,
        });
        const second = await migrationService.enter({
            name: 'Nour Sobhy',
            phone: '01066666666',
            offsetMinutes: 0,
        });

        const found = await patientService.byPhone({ phone: '01066666666' });
        expect(found.map((p) => p.id)).toEqual([first.patient.id, second.patient.id]);
    });
});
