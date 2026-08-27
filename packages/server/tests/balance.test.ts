import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { ERROR_CODE } from '@lustre/shared';
import { appointmentService } from '../src/modules/appointment/appointment.service.ts';
import { balanceService } from '../src/modules/balance/balance.service.ts';
import { patientService } from '../src/modules/patient/patient.service.ts';
import { visitService } from '../src/modules/visit/visit.service.ts';
import { setupDatabase, sql, truncateAll, uuid } from './helpers/db.ts';
import { expectAppError, clinic as fixtures, slot } from './helpers/factories.ts';

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

/**
 * The task's own worked example, in piastres. Kareem owes 9,550 EGP over three
 * visits and hands over 6,000: the oldest settles, the middle takes a partial,
 * the newest is untouched.
 */
const KAREEM = { oldest: 585_000, middle: 20_000, newest: 350_000 };
const KAREEM_OWES = KAREEM.oldest + KAREEM.middle + KAREEM.newest;

/** Three unsettled visits, oldest first — `slot(n)` is tomorrow 09:00 plus n minutes. */
async function threeDebts(patientId: string, branchId: string) {
    const oldest = await checkedOut(patientId, branchId, slot(), KAREEM.oldest, 0);
    const middle = await checkedOut(patientId, branchId, slot(60), KAREEM.middle, 0);
    const newest = await checkedOut(patientId, branchId, slot(120), KAREEM.newest, 0);
    return { oldest, middle, newest };
}

/** What each of a patient's visits still owes, keyed by visit id. */
async function owedPerVisit(patientId: string): Promise<Record<string, number>> {
    const rows = await balanceService.byPatient(patientId);
    return Object.fromEntries(rows.map((row) => [row.visitId, row.balance]));
}

describe('balance.settle — allocation', () => {
    test('fills the oldest debt first and leaves the newest untouched', async () => {
        const f = await fixtures();
        const { oldest, middle, newest } = await threeDebts(f.patient.id, f.branch.id);

        const report = await balanceService.settle({
            patientId: f.patient.id,
            amount: 600_000,
            method: 'cash',
        });

        expect(report.outstandingBefore).toBe(KAREEM_OWES);
        expect(report.outstandingAfter).toBe(KAREEM_OWES - 600_000);

        // The newest is absent rather than present with a zero — an untouched
        // visit is not part of what this payment did.
        expect(report.visits.map((v) => [v.visitId, v.amount, v.settled])).toEqual([
            [oldest.id, KAREEM.oldest, true],
            [middle.id, 600_000 - KAREEM.oldest, false],
        ]);

        const owed = await owedPerVisit(f.patient.id);
        expect(owed[oldest.id]).toBeUndefined();
        expect(owed[middle.id]).toBe(KAREEM.middle - (600_000 - KAREEM.oldest));
        expect(owed[newest.id]).toBe(KAREEM.newest);
    });

    test('paying the whole total takes every visit to zero', async () => {
        const f = await fixtures();
        await threeDebts(f.patient.id, f.branch.id);

        const report = await balanceService.settle({
            patientId: f.patient.id,
            amount: KAREEM_OWES,
            method: 'visa',
        });

        expect(report.outstandingAfter).toBe(0);
        expect(report.visits).toHaveLength(3);
        expect(report.visits.every((visit) => visit.settled)).toBe(true);
        expect(await balanceService.byPatient(f.patient.id)).toEqual([]);
    });

    test('names the visit ref on every slice — the paper file is written per visit', async () => {
        const f = await fixtures();
        await threeDebts(f.patient.id, f.branch.id);

        const report = await balanceService.settle({
            patientId: f.patient.id,
            amount: 600_000,
            method: 'cash',
        });

        for (const visit of report.visits) {
            expect(visit.ref).toMatch(/^\d{6}-[A-Z0-9]+$/);
            expect(visit.outstandingAfter).toBe(visit.outstandingBefore - visit.amount);
        }
    });

    /**
     * Money carried over from the old system is the oldest debt a patient has,
     * and `outstanding`/`byPatient` both count it. Allocation follows them
     * rather than inventing a second rule about it.
     */
    test('allocates against an opening balance before this clinic’s own work', async () => {
        const f = await fixtures();
        const carried = await checkedOut(f.patient.id, f.branch.id, slot(), 400_000, 0);
        await sql`
            UPDATE appointments SET is_opening_balance = true
            WHERE id = (SELECT appointment_id FROM visits WHERE id = ${carried.id})
        `;
        const recent = await checkedOut(f.patient.id, f.branch.id, slot(60), 100_000, 0);

        const report = await balanceService.settle({
            patientId: f.patient.id,
            amount: 400_000,
            method: 'cash',
        });

        expect(report.visits.map((v) => v.visitId)).toEqual([carried.id]);
        expect((await owedPerVisit(f.patient.id))[recent.id]).toBe(100_000);
    });
});

describe('balance.settle — what it refuses', () => {
    test('refuses more than the patient owes, and writes nothing', async () => {
        const f = await fixtures();
        await threeDebts(f.patient.id, f.branch.id);

        await expectAppError(ERROR_CODE.PAYMENT_EXCEEDS_BALANCE, () =>
            balanceService.settle({
                patientId: f.patient.id,
                amount: KAREEM_OWES + 1,
                method: 'cash',
            }),
        );

        const report = await balanceService.outstanding();
        expect(report.total).toBe(KAREEM_OWES);
    });

    test('refuses a patient who owes nothing', async () => {
        const f = await fixtures();
        await checkedOut(f.patient.id, f.branch.id, slot(), 100_000, 100_000);

        await expectAppError(ERROR_CODE.NOTHING_OUTSTANDING, () =>
            balanceService.settle({ patientId: f.patient.id, amount: 10_000, method: 'cash' }),
        );
    });

    test('refuses a patient with no visits at all', async () => {
        const f = await fixtures();

        await expectAppError(ERROR_CODE.NOTHING_OUTSTANDING, () =>
            balanceService.settle({ patientId: f.patient.id, amount: 10_000, method: 'cash' }),
        );
    });

    test("refuses 'other' with no note, the way a single payment does", async () => {
        const f = await fixtures();
        await threeDebts(f.patient.id, f.branch.id);

        await expectAppError(ERROR_CODE.PAYMENT_NOTE_REQUIRED, () =>
            balanceService.settle({
                patientId: f.patient.id,
                amount: 10_000,
                method: 'other',
                methodNote: null,
            }),
        );
    });
});

/**
 * `procedure.reorder`'s rule, with money instead of sort order. Three inserts of
 * which the second fails would leave the patient having handed over 6,000 with
 * 5,850 recorded — and 5,850 is the figure the desk reads back to them. The
 * trigger fails the *second* slice specifically, so this is a genuine
 * mid-allocation failure and not a request that never started.
 */
describe('balance.settle — one transaction or none', () => {
    // `sql.unsafe` because a bind parameter cannot appear inside a function
    // body — Postgres plans the body separately and has no type for it. The
    // interpolated value is a uuid this test just generated.
    async function failPaymentsAgainst(visitId: string): Promise<void> {
        await sql.unsafe(`
            CREATE FUNCTION refuse_this_visit() RETURNS trigger AS $$
            BEGIN
                IF NEW.visit_id = '${visitId}'::uuid THEN
                    RAISE EXCEPTION 'the disk went away mid-allocation';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `);
        await sql`
            CREATE TRIGGER refuse_this_visit BEFORE INSERT ON payments
            FOR EACH ROW EXECUTE FUNCTION refuse_this_visit()
        `;
    }

    async function stopFailing(): Promise<void> {
        await sql`DROP TRIGGER IF EXISTS refuse_this_visit ON payments`;
        await sql`DROP FUNCTION IF EXISTS refuse_this_visit()`;
    }

    test('a failure mid-allocation leaves every balance byte-identical', async () => {
        const f = await fixtures();
        const { oldest, middle, newest } = await threeDebts(f.patient.id, f.branch.id);
        const before = await owedPerVisit(f.patient.id);

        await failPaymentsAgainst(middle.id);
        try {
            await expect(
                balanceService.settle({
                    patientId: f.patient.id,
                    amount: 600_000,
                    method: 'cash',
                }),
            ).rejects.toThrow();
        } finally {
            await stopFailing();
        }

        // The first slice committed nothing either: the oldest is still owed in
        // full, which is the assertion that the whole allocation rolled back.
        expect(await owedPerVisit(f.patient.id)).toEqual(before);
        expect(before[oldest.id]).toBe(KAREEM.oldest);
        expect(before[newest.id]).toBe(KAREEM.newest);

        const rows = await sql<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM payments`;
        expect(rows[0]?.count).toBe(0);
    });
});

/**
 * Two phones settling the same patient at once. Whichever commits first, the
 * loser reads the outstanding the winner left behind rather than the one it
 * started from — so the pair can never allocate more than the patient owes.
 */
describe('balance.settle — two phones at once', () => {
    test('the second settle sees what the first left, and is refused', async () => {
        const f = await fixtures();
        await threeDebts(f.patient.id, f.branch.id);

        const settled = await Promise.allSettled([
            balanceService.settle({ patientId: f.patient.id, amount: 600_000, method: 'cash' }),
            balanceService.settle({ patientId: f.patient.id, amount: 600_000, method: 'visa' }),
        ]);

        expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(settled.filter((r) => r.status === 'rejected')).toHaveLength(1);

        const report = await balanceService.outstanding();
        expect(report.total).toBe(KAREEM_OWES - 600_000);
    });

    test('two payments that both fit are both taken', async () => {
        const f = await fixtures();
        await threeDebts(f.patient.id, f.branch.id);

        await Promise.all([
            balanceService.settle({ patientId: f.patient.id, amount: 400_000, method: 'cash' }),
            balanceService.settle({ patientId: f.patient.id, amount: 400_000, method: 'visa' }),
        ]);

        const report = await balanceService.outstanding();
        expect(report.total).toBe(KAREEM_OWES - 800_000);
    });
});

/**
 * Each slice is an ordinary `payments` row, which is the whole reason there is
 * no patient-level payments table: everything downstream keeps working without
 * learning a new concept.
 */
describe('balance.settle — the rows it writes are ordinary payments', () => {
    test('summary and takings pick them up unchanged', async () => {
        const f = await fixtures();
        await threeDebts(f.patient.id, f.branch.id);

        await balanceService.settle({ patientId: f.patient.id, amount: 600_000, method: 'visa' });

        const [summary, takings] = await Promise.all([
            balanceService.summary(thisPeriod()),
            balanceService.takings(thisPeriod()),
        ]);

        expect(summary.collected).toBe(600_000);
        expect(takings.total).toBe(600_000);
        // Two visits were touched, so the method split carries two rows of one
        // payment each rather than one row of 600,000.
        expect(takings.byMethod).toEqual([{ method: 'visa', amount: 600_000, count: 2 }]);
    });

    test('a slice against an older visit counts as older money collected', async () => {
        const f = await fixtures();
        const old = await checkedOut(f.patient.id, f.branch.id, slot(), 200_000, 0);
        await backdate(old.id, 30);
        await checkedOut(f.patient.id, f.branch.id, slot(60), 100_000, 0);

        await balanceService.settle({ patientId: f.patient.id, amount: 250_000, method: 'cash' });

        const summary = await balanceService.summary(thisPeriod());

        expect(summary.olderCollected).toBe(200_000);
        expect(summary.olderVisits).toBe(1);
        expect(summary.collected).toBe(250_000);
    });
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

/**
 * Egypt keeps DST, so a range that starts in the other regime has two offsets.
 * The queries compare `paid_at` against an instant, so the boundary decides
 * inclusion outright — this is not a day-bucket aggregation that rounds the
 * difference away.
 *
 * Offsets are passed explicitly here rather than read from a clock, so the test
 * says the same thing in any timezone CI runs in.
 */
describe('a range that crosses a DST changeover', () => {
    const WINTER = 120; // UTC+2, in force on 1 January
    const SUMMER = 180; // UTC+3, in force when "This year" is being read

    async function payAt(paidAt: string, amount: number) {
        const f = await fixtures();
        const visit = await checkedOut(f.patient.id, f.branch.id, slot(), 1_000_000, 0);
        await sql`
            INSERT INTO payments (id, visit_id, amount, method, paid_at)
            VALUES (${uuid()}, ${visit.id}, ${amount}, 'cash', ${paidAt}::timestamptz)
        `;
    }

    // 23:30 local on 31 December under UTC+2 — the last half hour of the old
    // year, and squarely outside "This year".
    const NEW_YEARS_EVE = '2025-12-31T21:30:00Z';

    function thisYear(fromOffsetMinutes?: number) {
        return {
            from: '2026-01-01',
            to: isoDate(new Date()),
            offsetMinutes: SUMMER,
            fromOffsetMinutes,
        };
    }

    test("leaves the old year's last hour out when each end carries its own offset", async () => {
        await payAt(NEW_YEARS_EVE, 90_000);

        const summary = await balanceService.summary(thisYear(WINTER));

        expect(summary.collected).toBe(0);
    });

    test('takings agrees with summary on the same boundary', async () => {
        await payAt(NEW_YEARS_EVE, 90_000);

        const takings = await balanceService.takings(thisYear(WINTER));

        expect(takings.total).toBe(0);
        expect(takings.byMethod).toEqual([]);
    });

    test('one offset for both ends is what pulled it into the new year', async () => {
        await payAt(NEW_YEARS_EVE, 90_000);

        // The old behaviour: today's summer offset applied to 1 January opens
        // the window at 21:00Z instead of 22:00Z.
        const summary = await balanceService.summary(thisYear());

        expect(summary.collected).toBe(90_000);
    });

    test('still counts a payment that is genuinely inside the range', async () => {
        await payAt('2025-12-31T22:30:00Z', 90_000);

        const summary = await balanceService.summary(thisYear(WINTER));

        expect(summary.collected).toBe(90_000);
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

    /**
     * `payments.amount` is `integer`, so a SUM of it overflows int4 at 2^31−1
     * piastres — about 21.5M EGP, a lifetime of takings rather than an
     * impossible number. Cast back to `::int` Postgres raises `integer out of
     * range` rather than saturating, which would take the dashboard out for
     * good the moment the clinic passed that figure. "All time" sums the whole
     * table on every visit to the screen, so this is the query that finds it.
     *
     * Inserted directly: the zod input caps a single payment far below this.
     * Nothing caps the sum.
     */
    test('sums past the 32-bit ceiling instead of throwing', async () => {
        const f = await fixtures();
        const visit = await checkedOut(f.patient.id, f.branch.id, slot(), 1_000_000, 0);

        const each = 1_000_000_000;
        for (let i = 0; i < 3; i++) {
            await sql`
                INSERT INTO payments (id, visit_id, amount, method, paid_at)
                VALUES (${uuid()}, ${visit.id}, ${each}, 'cash', now())
            `;
        }

        const [summary, takings] = await Promise.all([
            balanceService.summary(thisPeriod()),
            balanceService.takings(thisPeriod()),
        ]);

        expect(3 * each).toBeGreaterThan(2 ** 31 - 1);
        expect(summary.collected).toBe(3 * each);
        expect(takings.total).toBe(3 * each);
        expect(takings.byMethod[0]?.amount).toBe(3 * each);
    });

    test('carries an outstanding balance past the same ceiling', async () => {
        const f = await fixtures();
        const first = await checkedOut(f.patient.id, f.branch.id, slot(), 1_000_000, 0);
        const second = await checkedOut(f.patient.id, f.branch.id, slot(60), 1_000_000, 0);

        const each = 2_000_000_000;
        await sql`UPDATE visits SET charged_total = ${each} WHERE id IN (${first.id}, ${second.id})`;

        const report = await balanceService.outstanding();

        expect(2 * each).toBeGreaterThan(2 ** 31 - 1);
        expect(report.total).toBe(2 * each);
        expect(report.patients[0]?.balance).toBe(2 * each);
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
