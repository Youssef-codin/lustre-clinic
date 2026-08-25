/**
 * SPEC §10:
 *
 *     balance = visits.charged_total - COALESCE(SUM(payments.amount), 0)
 *
 * Derived, never stored. There is no unpaid status — a payment is a row, not a
 * state transition — so every figure here is computed at read time.
 *
 * In `summary`, charged is attributed to the visit's appointment date while
 * collected is attributed to the day the money arrived, which is why the two
 * are counted separately rather than differenced per visit. `to` is inclusive
 * as a date, so the range ends at the start of the following day.
 *
 * `outstanding` and `byPatient` count opening balances — money carried over
 * from the old system is still owed, and a patient's total has to say so.
 * `summary` does not: see the note on its charged query.
 */
import type { PaymentMethod } from '@lustre/shared';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { appointments, patients, payments, visits } from '../../db/schema.ts';
import { dayRange } from '../../util/time.ts';
import type { BalanceSummaryInput, BalanceTakingsInput } from './balance.schema.ts';

export interface PatientBalance {
    patientId: string;
    name: string;
    phone: string;
    balance: number;
    oldestUnpaidAt: Date;
}

export interface OutstandingReport {
    total: number;
    patients: PatientBalance[];
}

export interface VisitBalance {
    visitId: string;
    appointmentId: string;
    ref: string;
    startsAt: Date;
    chargedTotal: number;
    paidTotal: number;
    balance: number;
}

export interface BalanceSummary {
    charged: number;
    collected: number;
    difference: number;
    /** Distinct patients carrying a balance on a visit charged inside the range. */
    duePatients: number;
    /**
     * The part of `collected` that paid for work charged before the range
     * started. A real join of payment date against visit date — emphatically
     * not `collected - charged`, which is only the period's net position and
     * goes negative for reasons that have nothing to do with old visits.
     */
    olderCollected: number;
    /** Distinct visits that `olderCollected` arrived against. */
    olderVisits: number;
}

export interface MethodTaking {
    method: PaymentMethod;
    amount: number;
    count: number;
}

export interface TakingsReport {
    total: number;
    byMethod: MethodTaking[];
}

function paidPerVisit() {
    return db
        .select({
            visitId: payments.visitId,
            paidTotal: sql<number>`SUM(${payments.amount})::int`.as('paid_total'),
        })
        .from(payments)
        .groupBy(payments.visitId)
        .as('paid');
}

export const balanceService = {
    async outstanding(): Promise<OutstandingReport> {
        const paid = paidPerVisit();
        const balance = sql<number>`SUM(${visits.chargedTotal} - COALESCE(${paid.paidTotal}, 0))::int`;

        const rows = await db
            .select({
                patientId: patients.id,
                name: patients.name,
                phone: patients.phone,
                balance,
                oldestUnpaidAt: sql<Date>`MIN(${appointments.startsAt})`,
            })
            .from(visits)
            .innerJoin(appointments, eq(visits.appointmentId, appointments.id))
            .innerJoin(patients, eq(appointments.patientId, patients.id))
            .leftJoin(paid, eq(paid.visitId, visits.id))
            .groupBy(patients.id, patients.name, patients.phone)
            .having(sql`SUM(${visits.chargedTotal} - COALESCE(${paid.paidTotal}, 0)) > 0`)
            .orderBy(desc(balance));

        return {
            total: rows.reduce((sum, row) => sum + row.balance, 0),
            patients: rows.map((row) => ({ ...row, oldestUnpaidAt: new Date(row.oldestUnpaidAt) })),
        };
    },

    async byPatient(patientId: string): Promise<VisitBalance[]> {
        const paid = paidPerVisit();

        const rows = await db
            .select({
                visitId: visits.id,
                appointmentId: appointments.id,
                ref: appointments.ref,
                startsAt: appointments.startsAt,
                chargedTotal: visits.chargedTotal,
                paidTotal: sql<number>`COALESCE(${paid.paidTotal}, 0)::int`,
            })
            .from(visits)
            .innerJoin(appointments, eq(visits.appointmentId, appointments.id))
            .leftJoin(paid, eq(paid.visitId, visits.id))
            .where(
                and(
                    eq(appointments.patientId, patientId),
                    sql`${visits.chargedTotal} - COALESCE(${paid.paidTotal}, 0) > 0`,
                ),
            )
            .orderBy(asc(appointments.startsAt));

        return rows.map((row) => ({ ...row, balance: row.chargedTotal - row.paidTotal }));
    },

    async summary(input: BalanceSummaryInput): Promise<BalanceSummary> {
        const { from } = dayRange(input.from, input.offsetMinutes);
        const { to } = dayRange(input.to, input.offsetMinutes);

        // Charged is what this clinic billed in the period. An opening balance
        // was billed by the old system before the cutoff, so it is excluded
        // here and left in `outstanding`, where it belongs — the patient owes
        // it either way, but nobody charged it on the day the row is dated.
        const [charged] = await db
            .select({ total: sql<number>`COALESCE(SUM(${visits.chargedTotal}), 0)::int` })
            .from(visits)
            .innerJoin(appointments, eq(visits.appointmentId, appointments.id))
            .where(
                and(
                    gte(appointments.startsAt, from),
                    lt(appointments.startsAt, to),
                    eq(appointments.isOpeningBalance, false),
                ),
            );

        const [collected] = await db
            .select({ total: sql<number>`COALESCE(SUM(${payments.amount}), 0)::int` })
            .from(payments)
            .where(and(gte(payments.paidAt, from), lt(payments.paidAt, to)));

        const paid = paidPerVisit();

        // Who the period's shortfall is spread across, for the hero's
        // "· 12 patients". One patient with three unpaid visits is one patient,
        // hence the DISTINCT; opening balances are excluded for the same reason
        // they are excluded from `charged` above.
        const [due] = await db
            .select({ patients: sql<number>`COUNT(DISTINCT ${appointments.patientId})::int` })
            .from(visits)
            .innerJoin(appointments, eq(visits.appointmentId, appointments.id))
            .leftJoin(paid, eq(paid.visitId, visits.id))
            .where(
                and(
                    gte(appointments.startsAt, from),
                    lt(appointments.startsAt, to),
                    eq(appointments.isOpeningBalance, false),
                    sql`${visits.chargedTotal} - COALESCE(${paid.paidTotal}, 0) > 0`,
                ),
            );

        // Money that arrived in the range against a visit dated before it.
        // Opening balances belong here: they are the oldest debt there is, and
        // a payment against one is exactly this period settling older work.
        const [older] = await db
            .select({
                collected: sql<number>`COALESCE(SUM(${payments.amount}), 0)::int`,
                visitCount: sql<number>`COUNT(DISTINCT ${payments.visitId})::int`,
            })
            .from(payments)
            .innerJoin(visits, eq(payments.visitId, visits.id))
            .innerJoin(appointments, eq(visits.appointmentId, appointments.id))
            .where(and(gte(payments.paidAt, from), lt(payments.paidAt, to), lt(appointments.startsAt, from)));

        const chargedTotal = charged?.total ?? 0;
        const collectedTotal = collected?.total ?? 0;

        return {
            charged: chargedTotal,
            collected: collectedTotal,
            difference: chargedTotal - collectedTotal,
            duePatients: due?.patients ?? 0,
            olderCollected: older?.collected ?? 0,
            olderVisits: older?.visitCount ?? 0,
        };
    },

    /**
     * What was collected in the range, split by how it was paid. Attributed to
     * `paid_at` like `summary.collected`, so the two agree — the takings card
     * and the hero's "Collected" are the same money counted two ways.
     *
     * A method nobody used is absent rather than a zero row: the screen already
     * has a sentence for a period that collected nothing, and a 0% bar for
     * Instapay in a clinic that has never taken one is noise. Refunds are
     * negative payments (`0002_payment_corrections.sql`), so a method's total
     * can come out below zero, and that is the honest figure.
     */
    async takings(input: BalanceTakingsInput): Promise<TakingsReport> {
        const { from } = dayRange(input.from, input.offsetMinutes);
        const { to } = dayRange(input.to, input.offsetMinutes);

        const amount = sql<number>`SUM(${payments.amount})::int`;

        const byMethod = await db
            .select({ method: payments.method, amount, count: sql<number>`COUNT(*)::int` })
            .from(payments)
            .where(and(gte(payments.paidAt, from), lt(payments.paidAt, to)))
            .groupBy(payments.method)
            .orderBy(desc(amount));

        return { total: byMethod.reduce((sum, row) => sum + row.amount, 0), byMethod };
    },
};
