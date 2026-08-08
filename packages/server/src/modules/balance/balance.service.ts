import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { appointments, patients, payments, visits } from '../../db/schema.ts';
import { dayRange } from '../../util/time.ts';
import type { BalanceSummaryInput } from './balance.schema.ts';

/**
 * SPEC §10:
 *
 *     balance = visits.charged_total - COALESCE(SUM(payments.amount), 0)
 *
 * Derived, never stored. There is no unpaid status — a payment is a row, not a
 * state transition — so every figure here is computed at read time.
 */

export interface PatientBalance {
    patientId: string;
    name: string;
    phone: string;
    balance: number;
    /** Start of the oldest visit that still owes something. */
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
    /** `charged - collected` over the period, not the standing balance. */
    difference: number;
}

/** Payments rolled up per visit, reused by every query in this module. */
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
    /** Patients who owe something, aggregated across their visits (§10). */
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

    /** That patient's visits which still owe something. */
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

    /**
     * Charged versus collected over a period (§10). Charged is attributed to
     * the visit's appointment date; collected is attributed to the day the
     * money arrived, which is why the two are counted separately rather than
     * differenced per visit.
     */
    async summary(input: BalanceSummaryInput): Promise<BalanceSummary> {
        const { from } = dayRange(input.from, input.offsetMinutes);
        // `to` is inclusive as a date, so the range ends at the start of the
        // following day.
        const { to } = dayRange(input.to, input.offsetMinutes);

        const [charged] = await db
            .select({ total: sql<number>`COALESCE(SUM(${visits.chargedTotal}), 0)::int` })
            .from(visits)
            .innerJoin(appointments, eq(visits.appointmentId, appointments.id))
            .where(and(gte(appointments.startsAt, from), lt(appointments.startsAt, to)));

        const [collected] = await db
            .select({ total: sql<number>`COALESCE(SUM(${payments.amount}), 0)::int` })
            .from(payments)
            .where(and(gte(payments.paidAt, from), lt(payments.paidAt, to)));

        const chargedTotal = charged?.total ?? 0;
        const collectedTotal = collected?.total ?? 0;

        return {
            charged: chargedTotal,
            collected: collectedTotal,
            difference: chargedTotal - collectedTotal,
        };
    },
};
