import { expect } from 'bun:test';
import type { ErrorCode } from '@mawid/shared';
import { AppError } from '../../src/errors/AppError.ts';
import { appointmentService } from '../../src/modules/appointment/appointment.service.ts';
import { branchService } from '../../src/modules/branch/branch.service.ts';
import { patientService } from '../../src/modules/patient/patient.service.ts';
import { procedureService } from '../../src/modules/procedure/procedure.service.ts';
import { visitService } from '../../src/modules/visit/visit.service.ts';

/**
 * The fixtures every DB-backed suite books against, in one place so the files
 * agree on what "the clinic" is. Prices are piastres throughout (§9).
 */

/** 300 EGP. */
export const CHECKUP_PRICE = 30_000;
/** 2700 EGP. */
export const ROOT_CANAL_PRICE = 270_000;
/** 50 EGP, and the one procedure that takes a quantity. */
export const XRAY_PRICE = 5_000;
/** 800 EGP, and the one procedure that is tooth-specific (§5). */
export const EXTRACTION_PRICE = 80_000;

export interface Clinic {
    branch: Awaited<ReturnType<typeof branchService.create>>;
    checkup: Awaited<ReturnType<typeof procedureService.create>>;
    rootCanal: Awaited<ReturnType<typeof procedureService.create>>;
    xray: Awaited<ReturnType<typeof procedureService.create>>;
    extraction: Awaited<ReturnType<typeof procedureService.create>>;
    patient: Awaited<ReturnType<typeof patientService.create>>;
}

/** One branch, four procedures, one patient. */
export async function clinic(): Promise<Clinic> {
    const branch = await branchService.create({ name: 'Main' });
    const checkup = await procedureService.create({
        name: 'Checkup',
        defaultPrice: CHECKUP_PRICE,
        hasQuantity: false,
        isToothSpecific: false,
        isCheckup: true,
        sortOrder: 0,
    });
    const rootCanal = await procedureService.create({
        name: 'Root canal',
        defaultPrice: ROOT_CANAL_PRICE,
        hasQuantity: false,
        isToothSpecific: false,
        isCheckup: false,
        sortOrder: 1,
    });
    const xray = await procedureService.create({
        name: 'X-ray',
        defaultPrice: XRAY_PRICE,
        hasQuantity: true,
        isToothSpecific: false,
        isCheckup: false,
        sortOrder: 2,
    });
    const extraction = await procedureService.create({
        name: 'Extraction',
        defaultPrice: EXTRACTION_PRICE,
        hasQuantity: false,
        isToothSpecific: true,
        isCheckup: false,
        sortOrder: 3,
    });
    const patient = await patientService.create({
        name: 'Nadia Hassan',
        phone: '01012345678',
        custom: {},
    });

    return { branch, checkup, rootCanal, xray, extraction, patient };
}

/**
 * Tomorrow at 09:00 UTC, shifted by `offsetMinutes`. Future, so a booking made
 * here never lands in the missed list, and far enough from midnight that a run
 * at any hour of the day picks the same clinic day.
 */
export function slot(offsetMinutes = 0): string {
    const at = new Date();
    at.setUTCDate(at.getUTCDate() + 1);
    at.setUTCHours(9, 0, 0, 0);
    return new Date(at.getTime() + offsetMinutes * 60_000).toISOString();
}

/** A clinic with one appointment booked into `startsAt`. */
export async function bookedAppointment(startsAt = slot()) {
    const fixtures = await clinic();
    const appointment = await appointmentService.create({
        patient: { kind: 'existing', patientId: fixtures.patient.id },
        branchId: fixtures.branch.id,
        startsAt,
        offsetMinutes: 0,
    });
    return { ...fixtures, appointment };
}

/** The same, checked in — so the visit exists with its seeded checkup line (§8). */
export async function checkedInVisit(startsAt = slot()) {
    const booked = await bookedAppointment(startsAt);
    const visit = await visitService.checkIn({ appointmentId: booked.appointment.id });
    return { ...booked, visit };
}

/**
 * Asserts `fn` rejects with a specific `AppError`. A resolved promise is a
 * failure — the point is that the rule fired, not that nothing exploded.
 */
export async function expectAppError(code: ErrorCode, fn: () => Promise<unknown>): Promise<void> {
    try {
        await fn();
    } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(code);
        return;
    }
    throw new Error(`expected ${code}, but nothing was thrown`);
}
