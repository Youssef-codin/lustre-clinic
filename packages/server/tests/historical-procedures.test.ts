import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { ERROR_CODE } from '@lustre/shared';
import { balanceService } from '../src/modules/balance/balance.service.ts';
import { patientService } from '../src/modules/patient/patient.service.ts';
import { procedureHistoryService } from '../src/modules/procedure/procedure.history.ts';
import { settingsService } from '../src/modules/settings/settings.service.ts';
import { setupDatabase, truncateAll } from './helpers/db.ts';
import { type Clinic, expectAppError, clinic as fixtures } from './helpers/factories.ts';

/**
 * Adding work a patient had done before this system recorded it, from their own
 * record rather than at registration (`procedure.addHistorical`).
 *
 * It writes through `migration.service`, so what it produces is not new and
 * `migration.test.ts` already holds it to account. What is asserted here is the
 * part that *is* new: that it reaches an existing patient, that the money does
 * not move when it does, and that the two refusals the registration block makes
 * are made here too — a second path that quietly accepts what the first one
 * refuses is how the two stop meaning the same thing.
 */

const CUTOFF = '2026-08-01';

async function migrating(): Promise<Clinic> {
    const clinic = await fixtures();
    await settingsService.update({
        migrationBranchId: clinic.branch.id,
        migrationCutoffDate: CUTOFF,
        patientRefNext: 900,
    });
    return clinic;
}

async function register(phone: string) {
    return patientService.create({ name: 'On File Already', phone, birthDate: '1990-01-01', custom: {} });
}

describe('adding historical procedures to a patient on file', () => {
    beforeAll(setupDatabase);
    beforeEach(truncateAll);

    test('lands in the record as dated history, and owes nothing', async () => {
        const clinic = await migrating();
        const patient = await register('01055550001');

        await procedureHistoryService.add({
            patientId: patient.id,
            procedures: [
                { procedureId: clinic.checkup.id, quantity: 1, performedOn: '2024-03-14' },
                {
                    procedureId: clinic.extraction.id,
                    quantity: 1,
                    tooth: 'UL6',
                    performedOn: '2024-03-14',
                },
            ],
        });

        const { history } = await patientService.byId(patient.id);

        // One day on the file is one row, however many lines it names.
        expect(history).toHaveLength(1);
        const [row] = history;
        expect(row?.isImported).toBe(true);
        expect(row?.dateUnknown).toBe(false);
        expect(row?.startsAt.toISOString()).toBe('2024-03-14T12:00:00.000Z');
        expect(row?.procedures).toHaveLength(2);

        // The whole promise: no visit behind it, so there is nothing to charge,
        // nothing to owe and nothing to pay.
        expect(row?.visitId).toBeNull();
        expect(row?.chargedTotal).toBe(0);
        expect(row?.balance).toBe(0);

        const outstanding = await balanceService.outstanding();
        expect(outstanding.patients.find((p) => p.patientId === patient.id)).toBeUndefined();
    });

    // The file says what was done and not always when. Such a row carries the
    // cutoff only because `starts_at` is NOT NULL, and the flag is what stops
    // the record reading that day out as though it were the answer.
    test('marks an undated entry rather than picking a day for it', async () => {
        const clinic = await migrating();
        const patient = await register('01055550002');

        await procedureHistoryService.add({
            patientId: patient.id,
            procedures: [{ procedureId: clinic.checkup.id, quantity: 1 }],
        });

        const [row] = (await patientService.byId(patient.id)).history;
        expect(row?.isImported).toBe(true);
        expect(row?.dateUnknown).toBe(true);
    });

    test('groups by the day, so two days are two rows', async () => {
        const clinic = await migrating();
        const patient = await register('01055550003');

        await procedureHistoryService.add({
            patientId: patient.id,
            procedures: [
                { procedureId: clinic.checkup.id, quantity: 1, performedOn: '2024-03-14' },
                { procedureId: clinic.checkup.id, quantity: 1, performedOn: '2025-01-09' },
            ],
        });

        const { history } = await patientService.byId(patient.id);
        expect(history).toHaveLength(2);
        expect(history.every((row) => row.isImported)).toBe(true);
    });

    test('adds to what is already there rather than replacing it', async () => {
        const clinic = await migrating();
        const patient = await register('01055550004');

        const first = { procedureId: clinic.checkup.id, quantity: 1, performedOn: '2024-03-14' };
        await procedureHistoryService.add({ patientId: patient.id, procedures: [first] });
        await procedureHistoryService.add({
            patientId: patient.id,
            procedures: [{ procedureId: clinic.checkup.id, quantity: 1, performedOn: '2025-01-09' }],
        });

        expect((await patientService.byId(patient.id)).history).toHaveLength(2);
    });

    test('refuses a patient who is not on file', async () => {
        const clinic = await migrating();

        await expectAppError(ERROR_CODE.NOT_FOUND, () =>
            procedureHistoryService.add({
                patientId: '11111111-1111-1111-1111-111111111111',
                procedures: [{ procedureId: clinic.checkup.id, quantity: 1 }],
            }),
        );
    });

    // Both of these are the registration block's own refusals, made here for
    // the same reasons. Work dated since the changeover was done at this clinic
    // and belongs to a visit that charges for it; an imported row is one every
    // operational view leaves out.
    test('refuses a date after the cutoff, and allows the cutoff day itself', async () => {
        const clinic = await migrating();
        const patient = await register('01055550005');

        await expectAppError(ERROR_CODE.IMPORTED_DATE_AFTER_CUTOFF, () =>
            procedureHistoryService.add({
                patientId: patient.id,
                procedures: [{ procedureId: clinic.checkup.id, quantity: 1, performedOn: '2026-08-02' }],
            }),
        );
        expect((await patientService.byId(patient.id)).history).toHaveLength(0);

        await procedureHistoryService.add({
            patientId: patient.id,
            procedures: [{ procedureId: clinic.checkup.id, quantity: 1, performedOn: CUTOFF }],
        });
        expect((await patientService.byId(patient.id)).history).toHaveLength(1);
    });

    test('refuses it at all while the clinic has no cutoff configured', async () => {
        const clinic = await fixtures();
        const patient = await register('01055550006');

        await expectAppError(ERROR_CODE.MIGRATION_NOT_CONFIGURED, () =>
            procedureHistoryService.add({
                patientId: patient.id,
                procedures: [{ procedureId: clinic.checkup.id, quantity: 1 }],
            }),
        );
    });

    // §5 is applied per day, the same as it is on a registration: a tooth-less
    // line for a procedure that names a tooth is refused, and nothing is left
    // behind when it is.
    test('holds the catalogue rules, and writes nothing when one is broken', async () => {
        const clinic = await migrating();
        const patient = await register('01055550007');

        await expectAppError(ERROR_CODE.TOOTH_REQUIRED, () =>
            procedureHistoryService.add({
                patientId: patient.id,
                procedures: [{ procedureId: clinic.extraction.id, quantity: 1 }],
            }),
        );

        expect((await patientService.byId(patient.id)).history).toHaveLength(0);
    });
});
