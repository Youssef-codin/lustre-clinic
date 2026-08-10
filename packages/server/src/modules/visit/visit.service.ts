/**
 * SPEC §8, §9. A visit is what happened, as opposed to what was scheduled.
 *
 * Check-in creates it and seeds the checkup line, so the default total is the
 * checkup price. Pricing is not a prerequisite for checkout: `setProcedures`
 * and `setPrice` are optional, may be called in any order, and procedure detail
 * is often entered after the patient has left.
 *
 * Procedure uniqueness is per tooth, not per procedure — an extraction on UL6
 * and one on UR3 are two real lines; tooth-less lines share one empty-string
 * key, keeping the old once-per-visit rule for them. `is_tooth_specific`
 * decides whether a tooth belongs on the line at all. The charged total tracks
 * the computed one until someone edits it, and `priced_at` records that they
 * did; both are frozen at checkout, when the balance the patient owes is
 * settled. Checkout closes either `checked_in` (the chair) or
 * `awaiting_payment` (the desk), and zero paid is a valid checkout — the
 * balance is derived (§10).
 */
import { canTransition, ERROR_CODE, type Tooth, WS_EVENT } from '@mawid/shared';
import { eq } from 'drizzle-orm';
import { db, type Executor } from '../../db/index.ts';
import { appointments, payments, procedureTypes, visitProcedures, visits } from '../../db/schema.ts';
import { AppError, PG_ERROR, pgErrorCode } from '../../errors/AppError.ts';
import { computeTotal } from '../../util/money.ts';
import { broadcast } from '../../ws/index.ts';
import { procedureService } from '../procedure/procedure.service.ts';
import type {
    CheckInInput,
    CheckOutInput,
    RecordPaymentInput,
    SetPriceInput,
    SetProceduresInput,
} from './visit.schema.ts';

export type VisitRow = typeof visits.$inferSelect;

export interface VisitLine {
    id: string;
    procedureId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    isCheckup: boolean;
    tooth: Tooth | null;
    note: string | null;
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
    balance: number;
}

async function requireVisit(executor: Executor, id: string): Promise<VisitRow> {
    const [row] = await executor.select().from(visits).where(eq(visits.id, id)).limit(1);
    if (!row) throw AppError.notFound('visit');
    return row;
}

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

            const checkup = await procedureService.findCheckup();
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

    async setProcedures(input: SetProceduresInput): Promise<Visit> {
        const seen = new Set<string>();

        const resolved = await Promise.all(
            input.procedures.map(async (line) => {
                const procedure = await procedureService.requireSelectable(line.procedureId);
                const tooth = line.tooth ?? null;

                if (procedure.isToothSpecific && !tooth) {
                    throw new AppError(
                        ERROR_CODE.TOOTH_REQUIRED,
                        'that procedure must name the tooth it was done on',
                        422,
                    );
                }
                if (!procedure.isToothSpecific && tooth) {
                    throw new AppError(
                        ERROR_CODE.TOOTH_NOT_APPLICABLE,
                        'that procedure is not done on a specific tooth',
                        422,
                    );
                }

                if (!procedure.hasQuantity) {
                    const key = `${procedure.id}:${tooth ?? ''}`;
                    if (seen.has(key)) {
                        throw new AppError(
                            ERROR_CODE.PROCEDURE_DUPLICATE,
                            tooth
                                ? 'that procedure may appear only once per tooth on a visit'
                                : 'that procedure may appear only once on a visit',
                            422,
                        );
                    }
                    seen.add(key);
                    if (line.quantity !== 1) {
                        throw new AppError(
                            ERROR_CODE.VALIDATION,
                            'that procedure does not take a quantity',
                            422,
                        );
                    }
                }

                return {
                    procedureId: procedure.id,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice ?? procedure.defaultPrice,
                    tooth,
                    note: line.note ?? null,
                };
            }),
        );

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

            if (!visit.pricedAt) {
                await tx.update(visits).set({ chargedTotal: computedTotal }).where(eq(visits.id, visit.id));
            }
        });

        broadcast(WS_EVENT.VISIT_UPDATED, { id: input.visitId });
        return this.byId(input.visitId);
    },

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

    async recordPayment(input: RecordPaymentInput): Promise<Visit> {
        await db.transaction(async (tx) => {
            const visit = await requireVisit(tx, input.visitId);
            await insertPayment(tx, visit.id, input.amount, input.method, input.methodNote ?? null);
        });

        broadcast(WS_EVENT.VISIT_UPDATED, { id: input.visitId });
        return this.byId(input.visitId);
    },

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
