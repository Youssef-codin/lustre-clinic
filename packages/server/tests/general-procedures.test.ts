import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { ERROR_CODE } from '@lustre/shared';
import { appointmentService } from '../src/modules/appointment/appointment.service.ts';
import { settingsService } from '../src/modules/settings/settings.service.ts';
import { setupDatabase, truncateAll } from './helpers/db.ts';
import { clinic, expectAppError, todaySlot } from './helpers/factories.ts';

/**
 * A clinic on general procedures is never asked for a tooth. The catalogue keeps
 * its own flags, so the dental rule is back the moment the setting is off.
 */

beforeAll(async () => {
    await setupDatabase();
});

beforeEach(async () => {
    await truncateAll();
});

describe('generalProcedures', () => {
    test('is off for a clinic that has never set it', async () => {
        expect((await settingsService.get()).generalProcedures).toBe(false);
    });

    test('books a tooth-specific procedure with no tooth', async () => {
        const { branch, patient, extraction } = await clinic();
        await settingsService.update({ generalProcedures: true });

        const booked = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: todaySlot(),
            offsetMinutes: 0,
            procedures: [{ procedureId: extraction.id, quantity: 1 }],
        });

        expect((await appointmentService.byId(booked.id)).procedures.map((line) => line.tooth)).toEqual([
            null,
        ]);
    });

    test('still keeps a tooth on a line that carries one', async () => {
        const { branch, patient, extraction } = await clinic();
        await settingsService.update({ generalProcedures: true });

        const booked = await appointmentService.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: todaySlot(),
            offsetMinutes: 0,
            procedures: [{ procedureId: extraction.id, quantity: 1, tooth: 'UL6' }],
        });

        expect((await appointmentService.byId(booked.id)).procedures.map((line) => line.tooth)).toEqual([
            'UL6',
        ]);
    });

    test('turned back off, asks for the tooth again', async () => {
        const { branch, patient, extraction } = await clinic();
        await settingsService.update({ generalProcedures: true });
        await settingsService.update({ generalProcedures: false });

        await expectAppError(ERROR_CODE.TOOTH_REQUIRED, () =>
            appointmentService.create({
                patient: { kind: 'existing', patientId: patient.id },
                branchId: branch.id,
                startsAt: todaySlot(),
                offsetMinutes: 0,
                procedures: [{ procedureId: extraction.id, quantity: 1 }],
            }),
        );
    });

    test('is the clinic setup, which a secretary may not change', async () => {
        await expectAppError(ERROR_CODE.ROLE_FORBIDDEN, () =>
            settingsService.update({ generalProcedures: true }, 'secretary'),
        );
    });
});
