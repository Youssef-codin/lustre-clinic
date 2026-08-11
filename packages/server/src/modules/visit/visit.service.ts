import { canTransition, ERROR_CODE, type Tooth, WS_EVENT } from '@mawid/shared';
import { asc, eq } from 'drizzle-orm';
import { db, type Executor } from '../../db/index.ts';
import {
    appointmentProcedures,
    appointments,
    payments,
    procedureTypes,
    visitProcedures,
    visits,
} from '../../db/schema.ts';
import { AppError, PG_ERROR, pgErrorCode } from '../../errors/AppError.ts';
import { computeTotal } from '../../util/money.ts';
import { broadcast } from '../../ws/index.ts';
import { resolveProcedureLines } from '../procedure/procedure.rules.ts';
import { procedureService } from '../procedure/procedure.service.ts';
import type {
    CheckInInput,
    CheckOutInput,
    RecordPaymentInput,
    SetPriceInput,
    SetProceduresInput,
} from './visit.schema.ts';

/**
 * SPEC §8, §9. A visit is what happened, as opposed to what was scheduled.
 *
 * Check-in creates it and seeds the checkup line, so the default total is the
 * checkup price. Pricing is not a prerequisite for checkout: `setProcedures`
 * and `setPrice` are optional, may be called in any order, and procedure detail
 * is often entered after the patient has left.
 */

export type VisitRow = typeof visits.$inferSelect;

export interface VisitLine {
    id: string;
    procedureId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    isCheckup: boolean;
    /** Palmer notation, e.g. `UL6`. Null when the procedure is not tooth-specific (§5). */
    tooth: Tooth | null;
    note: string | null;
    /** `unit_price × quantity`, before the checkup waiver (§9). */
    lineTotal: number;
}

export interface VisitPayment {
    id: string;
    amount: number;
    method: string;
    methodNote: string | null;
    paidAt: Date;
}

export interface Visit extends VisitRow {
    procedures: VisitLine[];
    payments: VisitPayment[];
    paidTotal: number;
    /** Derived, never stored (§10). */
    balance: number;
}

async function requireVisit(executor: Executor, id: string): Promise<VisitRow> {
    const [row] = await executor.select().from(visits).where(eq(visits.id, id)).limit(1);
    if (!row) throw AppError.notFound('visit');
    return row;
}

/** Recomputes `computed_total` from the lines currently on the visit (§9). */
async function recompute(executor: Executor, visitId: string): Promise<number> {
    const lines = await executor
        .select({
            unitPrice: visitProcedures.unitPrice,
            quantity: visitProcedures.quantity,
            isCheckup: procedureTypes.isCheckup,
        })
        .from(visitProcedures)
        .innerJoin(procedureTypes, eq(visitProcedures.procedureId, procedureTypes.id))
        .where(eq(visitProcedures.visitId, visitId));

    const computedTotal = computeTotal(lines);
    await executor.update(visits).set({ computedTotal }).where(eq(visits.id, visitId));
    return computedTotal;
}

export const visitService = {
    /**
     * §8 — the patient has arrived. Transitions the appointment, creates the
     * visit, and seeds the checkup line so the default total is the checkup
     * price even if nothing else is ever entered.
     */
    async checkIn(input: CheckInInput, executor?: Executor): Promise<VisitRow> {
        const run = async (tx: Executor): Promise<VisitRow> => {
            const [appointment] = await tx
                .select()
                .from(appointments)
                .where(eq(appointments.id, input.appointmentId))
                .limit(1);

            if (!appointment) throw AppError.notFound('appointment');

            if (!canTransition(appointment.status, 'checked_in')) {
                throw new AppError(
                    ERROR_CODE.INVALID_STATUS_TRANSITION,
                    `cannot check in an appointment that is ${appointment.status}`,
                    422,
                );
            }

            const now = new Date();

            let visit: VisitRow | undefined;
            try {
                [visit] = await tx
                    .insert(visits)
                    .values({ id: Bun.randomUUIDv7(), appointmentId: appointment.id, checkedInAt: now })
                    .returning();
            } catch (err) {
                if (pgErrorCode(err) === PG_ERROR.UNIQUE_VIOLATION) {
                    throw new AppError(
                        ERROR_CODE.VISIT_ALREADY_EXISTS,
                        'this appointment already has a visit',
                        409,
                        { cause: err },
                    );
                }
                throw err;
            }

            if (!visit) throw AppError.internal('visit insert returned nothing');

            await tx
                .update(appointments)
                .set({ status: 'checked_in', updatedAt: now })
                .where(eq(appointments.id, appointment.id));

            // §7 — the procedures the secretary planned at booking become the
            // visit's opening lines, so nothing is typed twice. Prices are
            // snapshotted now, not at booking: a slot reserved three weeks ago
            // bills at today's catalogue price.
            const planned = await tx
                .select({
                    procedureId: appointmentProcedures.procedureId,
                    quantity: appointmentProcedures.quantity,
                    tooth: appointmentProcedures.tooth,
                    note: appointmentProcedures.note,
                    defaultPrice: procedureTypes.defaultPrice,
                    isCheckup: procedureTypes.isCheckup,
                })
                .from(appointmentProcedures)
                .innerJoin(procedureTypes, eq(appointmentProcedures.procedureId, procedureTypes.id))
                .where(eq(appointmentProcedures.appointmentId, appointment.id))
                .orderBy(asc(appointmentProcedures.sortOrder));

            if (planned.length > 0) {
                await tx.insert(visitProcedures).values(
                    planned.map((line) => ({
                        id: Bun.randomUUIDv7(),
                        visitId: visit.id,
                        procedureId: line.procedureId,
                        quantity: line.quantity,
                        unitPrice: line.defaultPrice,
                        tooth: line.tooth,
                        note: line.note,
                    })),
                );
            }

            // §8 — the checkup line is seeded here, not at checkout. Skipped
            // when the booking already planned a checkup, or the visit would
            // open with two of them.
            const checkup = planned.some((line) => line.isCheckup)
                ? null
                : await procedureService.findCheckup();
            if (checkup) {
                await tx.insert(visitProcedures).values({
                    id: Bun.randomUUIDv7(),
                    visitId: visit.id,
                    procedureId: checkup.id,
                    quantity: 1,
                    unitPrice: checkup.defaultPrice,
                });
            }

            const computedTotal = await recompute(tx, visit.id);
            // The charged total starts at the computed one and stays editable.
            const [priced] = await tx
                .update(visits)
                .set({ chargedTotal: computedTotal })
                .where(eq(visits.id, visit.id))
                .returning();

            return priced ?? visit;
        };

        const visit = executor ? await run(executor) : await db.transaction(run);

        broadcast(WS_EVENT.VISIT_UPDATED, { id: visit.id });
        broadcast(WS_EVENT.APPOINTMENT_UPDATED, { id: visit.appointmentId });
        return visit;
    },

    async byId(id: string): Promise<Visit> {
        const visit = await requireVisit(db, id);

        const lines = await db
            .select({
                id: visitProcedures.id,
                procedureId: visitProcedures.procedureId,
                name: procedureTypes.name,
                quantity: visitProcedures.quantity,
                unitPrice: visitProcedures.unitPrice,
                isCheckup: procedureTypes.isCheckup,
                tooth: visitProcedures.tooth,
                note: visitProcedures.note,
            })
            .from(visitProcedures)
            .innerJoin(procedureTypes, eq(visitProcedures.procedureId, procedureTypes.id))
            .where(eq(visitProcedures.visitId, id));

        const paymentRows = await db
            .select({
                id: payments.id,
                amount: payments.amount,
                method: payments.method,
                methodNote: payments.methodNote,
                paidAt: payments.paidAt,
            })
            .from(payments)
            .where(eq(payments.visitId, id));

        const paidTotal = paymentRows.reduce((sum, p) => sum + p.amount, 0);

        return {
            ...visit,
            procedures: lines.map((l) => ({ ...l, lineTotal: l.unitPrice * l.quantity })),
            payments: paymentRows,
            paidTotal,
            balance: visit.chargedTotal - paidTotal,
        };
    },

    /**
     * §13 — replaces the whole list. Prices are snapshotted at write time (§5),
     * so a later price change never rewrites history.
     */
    async setProcedures(input: SetProceduresInput): Promise<Visit> {
        // Resolved before the transaction: these are reads against reference
        // data, and the checks are about the request, not about the visit.
        // The §5 rules are shared with booking; see `procedure.rules.ts`.
        const lines = await resolveProcedureLines(input.procedures);

        const resolved = lines.map((line, i) => ({
            procedureId: line.procedure.id,
            quantity: line.quantity,
            // An explicit override wins; otherwise the catalogue price is
            // snapshotted as of now (§5).
            unitPrice: input.procedures[i]?.unitPrice ?? line.procedure.defaultPrice,
            tooth: line.tooth,
            note: line.note,
        }));

        await db.transaction(async (tx) => {
            const visit = await requireVisit(tx, input.visitId);
            if (visit.completedAt) {
                throw new AppError(
                    ERROR_CODE.VISIT_ALREADY_COMPLETED,
                    'this visit is already checked out',
                    409,
                );
            }

            await tx.delete(visitProcedures).where(eq(visitProcedures.visitId, visit.id));

            if (resolved.length > 0) {
                await tx.insert(visitProcedures).values(
                    resolved.map((line) => ({
                        id: Bun.randomUUIDv7(),
                        visitId: visit.id,
                        ...line,
                    })),
                );
            }

            const computedTotal = await recompute(tx, visit.id);

            // The charged total tracks the computed one until someone edits it
            // (§9); `priced_at` is what records that they did.
            if (!visit.pricedAt) {
                await tx.update(visits).set({ chargedTotal: computedTotal }).where(eq(visits.id, visit.id));
            }
        });

        broadcast(WS_EVENT.VISIT_UPDATED, { id: input.visitId });
        return this.byId(input.visitId);
    },

    /**
     * §9 — the discount is the difference from `computed_total`.
     *
     * Refused once the visit is checked out, for the same reason
     * `setProcedures` is: what the patient owes is settled at checkout, and a
     * later edit would silently move a balance someone has already been told
     * about. A payment against that balance is a separate call (§10).
     */
    async setPrice(input: SetPriceInput): Promise<Visit> {
        const row = await db.transaction(async (tx) => {
            const visit = await requireVisit(tx, input.visitId);

            if (visit.completedAt) {
                throw new AppError(
                    ERROR_CODE.VISIT_ALREADY_COMPLETED,
                    'this visit is already checked out',
                    409,
                );
            }

            const [updated] = await tx
                .update(visits)
                .set({ chargedTotal: input.chargedTotal, pricedAt: new Date() })
                .where(eq(visits.id, visit.id))
                .returning();

            if (!updated) throw AppError.notFound('visit');
            return updated;
        });

        broadcast(WS_EVENT.VISIT_UPDATED, { id: row.id });
        return this.byId(row.id);
    },

    /**
     * §8 — completes the visit regardless of what was paid. The amount is
     * confirmed and editable here, because it is often the first time anyone
     * has looked at it.
     *
     * Reached from `checked_in` or from `awaiting_payment` (§7); the middle
     * step is optional, so a walk-in checks out straight from the chair.
     */
    async checkOut(input: CheckOutInput): Promise<Visit> {
        await db.transaction(async (tx) => {
            const visit = await requireVisit(tx, input.visitId);

            if (visit.completedAt) {
                throw new AppError(
                    ERROR_CODE.VISIT_ALREADY_COMPLETED,
                    'this visit is already checked out',
                    409,
                );
            }

            // §7 — checkout closes either the chair (`checked_in`) or the desk
            // (`awaiting_payment`). Anything else is not a visit in progress.
            const [appointment] = await tx
                .select()
                .from(appointments)
                .where(eq(appointments.id, visit.appointmentId))
                .limit(1);

            if (!appointment) throw AppError.notFound('appointment');

            if (!canTransition(appointment.status, 'done')) {
                throw new AppError(
                    ERROR_CODE.INVALID_STATUS_TRANSITION,
                    `cannot check out an appointment that is ${appointment.status}`,
                    422,
                );
            }

            const now = new Date();

            await tx
                .update(visits)
                .set({
                    chargedTotal: input.chargedTotal,
                    pricedAt: visit.pricedAt ?? now,
                    completedAt: now,
                })
                .where(eq(visits.id, visit.id));

            // Zero paid is a valid checkout — the balance is derived (§10).
            if (input.paidTotal > 0) {
                await insertPayment(tx, visit.id, input.paidTotal, input.method, input.methodNote ?? null);
            }

            await tx
                .update(appointments)
                .set({ status: 'done', updatedAt: now })
                .where(eq(appointments.id, appointment.id));
        });

        broadcast(WS_EVENT.VISIT_UPDATED, { id: input.visitId });
        return this.byId(input.visitId);
    },

    /** §10 — a payment made later, against an outstanding balance. */
    async recordPayment(input: RecordPaymentInput): Promise<Visit> {
        await db.transaction(async (tx) => {
            const visit = await requireVisit(tx, input.visitId);
            await insertPayment(tx, visit.id, input.amount, input.method, input.methodNote ?? null);
        });

        broadcast(WS_EVENT.VISIT_UPDATED, { id: input.visitId });
        return this.byId(input.visitId);
    },

    /** The visit for an appointment, if it has one. */
    async byAppointment(appointmentId: string): Promise<VisitRow | null> {
        const [row] = await db.select().from(visits).where(eq(visits.appointmentId, appointmentId)).limit(1);
        return row ?? null;
    },
};

async function insertPayment(
    executor: Executor,
    visitId: string,
    amount: number,
    method: RecordPaymentInput['method'],
    methodNote: string | null,
): Promise<void> {
    try {
        await executor.insert(payments).values({
            id: Bun.randomUUIDv7(),
            visitId,
            amount,
            method,
            methodNote,
        });
    } catch (err) {
        // The database enforces both rules; these map them onto the contract.
        if (pgErrorCode(err) === PG_ERROR.CHECK_VIOLATION) {
            throw method === 'other'
                ? new AppError(ERROR_CODE.PAYMENT_NOTE_REQUIRED, "method 'other' requires a note", 422, {
                      cause: err,
                  })
                : new AppError(ERROR_CODE.INVALID_AMOUNT, 'payment amount is out of range', 422, {
                      cause: err,
                  });
        }
        throw err;
    }
}
