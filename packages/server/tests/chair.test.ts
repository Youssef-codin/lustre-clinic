import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.ts';
import { visits } from '../src/db/schema.ts';
import { appointmentService } from '../src/modules/appointment/appointment.service.ts';
import { visitService } from '../src/modules/visit/visit.service.ts';
import { setupDatabase, truncateAll } from './helpers/db.ts';
import { bookedAppointment, clinic, slot } from './helpers/factories.ts';

/**
 * `visits.in_chair_at` — arriving and being seated are two events, and the
 * chair's progress bar on the day view measures from the second one.
 *
 * The rule the clinic actually runs on: the desk checks people in as they come
 * through the door and they queue, so only the head of that queue is in the
 * chair. Everyone behind them has arrived and not started. Measuring a visit
 * from `checked_in_at` charged the second patient of the morning with the first
 * one's time — the bar read `11:40 over` before the doctor had seen them.
 */

let closeDatabase: (() => Promise<void>) | undefined;

beforeAll(async () => {
    await setupDatabase();
});

beforeEach(async () => {
    await truncateAll();
});

afterAll(async () => {
    await closeDatabase?.();
});

async function seatStamp(visitId: string): Promise<Date | null> {
    const [row] = await db.select().from(visits).where(eq(visits.id, visitId)).limit(1);
    return row?.inChairAt ?? null;
}

describe('who is in the chair', () => {
    test('walking into an empty chair is arriving and being seated at once', async () => {
        const { visit } = await (async () => {
            const booked = await bookedAppointment();
            return { visit: await visitService.checkIn({ appointmentId: booked.appointment.id }) };
        })();

        const seated = await seatStamp(visit.id);

        expect(seated).not.toBeNull();
        expect(seated?.getTime()).toBe(visit.checkedInAt.getTime());
    });

    test('the second patient through the door has arrived and is not seated', async () => {
        const fixtures = await clinic();

        const first = await appointmentService.create({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });
        const second = await appointmentService.create({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            startsAt: slot(60),
            offsetMinutes: 0,
        });

        await visitService.checkIn({ appointmentId: first.id });
        const queued = await visitService.checkIn({ appointmentId: second.id });

        expect(await seatStamp(queued.id)).toBeNull();
    });

    test('going to the desk seats whoever has waited longest', async () => {
        const fixtures = await clinic();

        const first = await appointmentService.create({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });
        const second = await appointmentService.create({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            startsAt: slot(60),
            offsetMinutes: 0,
        });
        const third = await appointmentService.create({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            startsAt: slot(120),
            offsetMinutes: 0,
        });

        const inChair = await visitService.checkIn({ appointmentId: first.id });
        const waiting = await visitService.checkIn({ appointmentId: second.id });
        const behind = await visitService.checkIn({ appointmentId: third.id });

        await appointmentService.awaitPayment(first.id);

        // The chair passes to the longest wait, and only to them — the person
        // behind is still queueing and their bar has not started.
        expect(await seatStamp(waiting.id)).not.toBeNull();
        expect(await seatStamp(behind.id)).toBeNull();

        // The patient who left keeps the stamp: it records when their visit
        // began, not that they are still in the chair. The status says that.
        expect(await seatStamp(inChair.id)).not.toBeNull();
    });

    test('the stamp is when the chair emptied, not when the patient arrived', async () => {
        const fixtures = await clinic();

        const first = await appointmentService.create({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });
        const second = await appointmentService.create({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            startsAt: slot(60),
            offsetMinutes: 0,
        });

        await visitService.checkIn({ appointmentId: first.id });
        const waiting = await visitService.checkIn({ appointmentId: second.id });

        await Bun.sleep(20);
        await appointmentService.awaitPayment(first.id);

        const seated = await seatStamp(waiting.id);

        expect(seated).not.toBeNull();
        expect(seated?.getTime()).toBeGreaterThan(waiting.checkedInAt.getTime());
    });

    test('an empty waiting room leaves the chair empty rather than reseating anyone', async () => {
        const booked = await bookedAppointment();
        const only = await visitService.checkIn({ appointmentId: booked.appointment.id });
        const before = await seatStamp(only.id);

        await appointmentService.awaitPayment(booked.appointment.id);

        // Nothing to promote, and the patient who left is not re-stamped.
        expect((await seatStamp(only.id))?.getTime()).toBe(before?.getTime());
    });

    test('checking out straight from the chair hands it on too', async () => {
        const fixtures = await clinic();

        const first = await appointmentService.create({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });
        const second = await appointmentService.create({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            startsAt: slot(60),
            offsetMinutes: 0,
        });

        const inChair = await visitService.checkIn({ appointmentId: first.id });
        const waiting = await visitService.checkIn({ appointmentId: second.id });

        await visitService.checkOut({
            visitId: inChair.id,
            chargedTotal: 0,
            paidTotal: 0,
            method: 'cash',
        });

        expect(await seatStamp(waiting.id)).not.toBeNull();
    });
});
