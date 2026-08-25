import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { appointmentService } from '../src/modules/appointment/appointment.service.ts';
import { balanceService } from '../src/modules/balance/balance.service.ts';
import { patientService } from '../src/modules/patient/patient.service.ts';
import { visitService } from '../src/modules/visit/visit.service.ts';
import { setupDatabase, sql, truncateAll } from './helpers/db.ts';
import { clinic as fixtures, slot } from './helpers/factories.ts';

/**
 * The three period figures the money dashboard draws that `summary` did not
 * compute, plus `takings`. `modules.test.ts` already covers the derived
 * balances themselves (§10); this covers what the *range* means.
 *
 * The one worth reading twice is `olderCollected`. It is a join of payment date
 * against visit date, and it is NOT `collected - charged` — that shortcut is
 * the period's net position, which moves for reasons that have nothing to do
 * with old visits. `divergesFromTheShortcut` asserts the two disagree.
 */

const DAY_MS = 86_400_000;

function isoDate(at: Date): string {
    return at.toISOString().slice(0, 10);
}

/** Today through tomorrow, which contains `slot()` — tomorrow at 09:00 UTC. */
function thisPeriod() {
    return {
        from: isoDate(new Date()),
        to: isoDate(new Date(Date.now() + DAY_MS)),
        offsetMinutes: 0,
    };
}

async function checkedOut(
    patientId: string,
    branchId: string,
    startsAt: string,
    chargedTotal: number,
    paidTotal: number,
) {
    const appointment = await appointmentService.create({
        patient: { kind: 'existing', patientId },
        branchId,
        startsAt,
        offsetMinutes: 0,
    });
    const visit = await visitService.checkIn({ appointmentId: appointment.id });
    await visitService.checkOut({ visitId: visit.id, chargedTotal, paidTotal, method: 'cash' });
    return visit;
}

/**
 * Move a visit's appointment into the past. Booking one there is refused, and
 * the charge date is the only thing that makes a visit "older".
 */
async function backdate(visitId: string, days: number): Promise<void> {
    await sql`
        UPDATE appointments
        SET starts_at = starts_at - make_interval(days => ${days})
        WHERE id = (SELECT appointment_id FROM visits WHERE id = ${visitId})
    `;
}

beforeAll(async () => {
    await setupDatabase();
});

beforeEach(async () => {
    await truncateAll();
});

describe('balance.summary — duePatients', () => {
    test('counts patients, not unpaid visits', async () => {
        const f = await fixtures();
        const second = await patientService.create({
            name: 'Omar Khaled',
            phone: '01099887766',
            custom: {},
        });

        await checkedOut(f.patient.id, f.branch.id, slot(), 100_000, 0);
        await checkedOut(f.patient.id, f.branch.id, slot(60), 50_000, 0);
        await checkedOut(second.id, f.branch.id, slot(120), 40_000, 0);

        const summary = await balanceService.summary(thisPeriod());

        expect(summary.duePatients).toBe(2);
    });

    test('a patient who paid in full is not due', async () => {
        const f = await fixtures();
        await checkedOut(f.patient.id, f.branch.id, slot(), 100_000, 100_000);

        const summary = await balanceService.summary(thisPeriod());

        expect(summary.charged).toBe(100_000);
        expect(summary.duePatients).toBe(0);
    });
});

describe('balance.summary — older visits', () => {
    test('collects money paid in the period against a visit charged before it', async () => {
        const f = await fixtures();

        const old = await checkedOut(f.patient.id, f.branch.id, slot(), 200_000, 0);
        await backdate(old.id, 30);
        await visitService.recordPayment({ visitId: old.id, amount: 80_000, method: 'cash' });

        await checkedOut(f.patient.id, f.branch.id, slot(60), 100_000, 25_000);

        const summary = await balanceService.summary(thisPeriod());

        expect(summary.charged).toBe(100_000);
        expect(summary.collected).toBe(105_000);
        expect(summary.olderCollected).toBe(80_000);
        expect(summary.olderVisits).toBe(1);
    });

    test('diverges from collected minus charged, which is why it is a join', async () => {
        const f = await fixtures();

        const old = await checkedOut(f.patient.id, f.branch.id, slot(), 200_000, 0);
        await backdate(old.id, 30);
        await visitService.recordPayment({ visitId: old.id, amount: 80_000, method: 'cash' });

        await checkedOut(f.patient.id, f.branch.id, slot(60), 100_000, 25_000);

        const summary = await balanceService.summary(thisPeriod());

        expect(summary.collected - summary.charged).toBe(5_000);
        expect(summary.olderCollected).toBe(80_000);
    });

    test('one visit paid twice in the period is one older visit', async () => {
        const f = await fixtures();

        const old = await checkedOut(f.patient.id, f.branch.id, slot(), 200_000, 0);
        await backdate(old.id, 30);
        await visitService.recordPayment({ visitId: old.id, amount: 40_000, method: 'cash' });
        await visitService.recordPayment({ visitId: old.id, amount: 30_000, method: 'visa' });

        const summary = await balanceService.summary(thisPeriod());

        expect(summary.olderCollected).toBe(70_000);
        expect(summary.olderVisits).toBe(1);
    });

    test("this period's own work is not older", async () => {
        const f = await fixtures();
        await checkedOut(f.patient.id, f.branch.id, slot(), 100_000, 40_000);

        const summary = await balanceService.summary(thisPeriod());

        expect(summary.collected).toBe(40_000);
        expect(summary.olderCollected).toBe(0);
        expect(summary.olderVisits).toBe(0);
    });
});

describe('balance.takings', () => {
    test('splits what was collected by method, largest first', async () => {
        const f = await fixtures();
        const visit = await checkedOut(f.patient.id, f.branch.id, slot(), 500_000, 0);

        await visitService.recordPayment({ visitId: visit.id, amount: 100_000, method: 'cash' });
        await visitService.recordPayment({ visitId: visit.id, amount: 60_000, method: 'cash' });
        await visitService.recordPayment({ visitId: visit.id, amount: 250_000, method: 'visa' });

        const takings = await balanceService.takings(thisPeriod());

        expect(takings.total).toBe(410_000);
        expect(takings.byMethod).toEqual([
            { method: 'visa', amount: 250_000, count: 1 },
            { method: 'cash', amount: 160_000, count: 2 },
        ]);
    });

    test('a method nobody used is absent, not a zero row', async () => {
        const f = await fixtures();
        const visit = await checkedOut(f.patient.id, f.branch.id, slot(), 100_000, 0);
        await visitService.recordPayment({ visitId: visit.id, amount: 20_000, method: 'instapay' });

        const takings = await balanceService.takings(thisPeriod());

        expect(takings.byMethod.map((row) => row.method)).toEqual(['instapay']);
    });

    test('totals the same money as summary.collected', async () => {
        const f = await fixtures();
        const visit = await checkedOut(f.patient.id, f.branch.id, slot(), 300_000, 50_000);
        await visitService.recordPayment({
            visitId: visit.id,
            amount: 70_000,
            method: 'other',
            methodNote: 'Bank transfer',
        });

        const [summary, takings] = await Promise.all([
            balanceService.summary(thisPeriod()),
            balanceService.takings(thisPeriod()),
        ]);

        expect(takings.total).toBe(summary.collected);
    });

    test('collects nothing for a period with no payments', async () => {
        await fixtures();

        const takings = await balanceService.takings(thisPeriod());

        expect(takings.total).toBe(0);
        expect(takings.byMethod).toEqual([]);
    });

    /**
     * `visit.setPaid` writes the delta against what is already on the visit, so
     * correcting a paid total downwards inserts a negative payment row. The
     * takings card divides by `total` to size its bars, so these two shapes are
     * what stop it drawing a bar backwards or calling a busy day empty.
     */
    test('reports a method that refunded more than it took as negative', async () => {
        const f = await fixtures();
        const visit = await checkedOut(f.patient.id, f.branch.id, slot(), 300_000, 0);

        await visitService.recordPayment({ visitId: visit.id, amount: 200_000, method: 'cash' });
        await visitService.recordPayment({ visitId: visit.id, amount: 40_000, method: 'visa' });
        // The desk over-recorded the card payment; correcting it writes -40_000.
        await visitService.setPaid({ visitId: visit.id, paidTotal: 200_000, method: 'visa' });

        const takings = await balanceService.takings(thisPeriod());

        expect(takings.total).toBe(200_000);
        expect(takings.byMethod).toContainEqual({ method: 'visa', amount: 0, count: 2 });
    });

    test('can net to zero with real movements on it', async () => {
        const f = await fixtures();
        const visit = await checkedOut(f.patient.id, f.branch.id, slot(), 300_000, 0);

        await visitService.recordPayment({ visitId: visit.id, amount: 100_000, method: 'cash' });
        await visitService.setPaid({ visitId: visit.id, paidTotal: 0, method: 'cash' });

        const takings = await balanceService.takings(thisPeriod());

        // Zero total, two payment rows — "nothing was collected" would be false.
        expect(takings.total).toBe(0);
        expect(takings.byMethod).toEqual([{ method: 'cash', amount: 0, count: 2 }]);
    });
});
