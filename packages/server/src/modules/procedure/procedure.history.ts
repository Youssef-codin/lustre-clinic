/**
 * Work a patient had done before this system recorded it, added from their own
 * record instead of at registration.
 *
 * It writes exactly what the **Old patient** block writes — an appointment
 * flagged `is_imported`, carrying planned procedures and **no visit at all** —
 * by calling `migration.service`'s own plan and write rather than reimplementing
 * them. That is the whole point of living here: the module comment on
 * `migration.service` is about what happens when there are two ways to record
 * one thing, and a second grouping-and-cutoff implementation would be one.
 *
 * No visit is what satisfies "none of it affects checkout": a visit is where
 * money lives, so a row without one cannot be charged, owed or paid, and the
 * day view, revenue and statistics all exclude it by flag. It appears in the
 * record's history and in no total.
 *
 * The branch and the cutoff come from the clinic's migration configuration for
 * the same reason the registration block takes them from there — `branch_id` is
 * NOT NULL and neither is a fact the desk can answer per patient — and a line
 * dated after the cutoff is refused here too. Work done at this clinic since
 * the changeover belongs to a visit that charges for it, not to a row nothing
 * counts.
 */
import { ERROR_CODE, todayKey, WS_EVENT } from '@lustre/shared';
import { db } from '../../db/index.ts';
import { visitProcedures, visits } from '../../db/schema.ts';
import { AppError } from '../../errors/AppError.ts';
import { broadcast } from '../../ws/index.ts';
import { branchService } from '../branch/branch.service.ts';
import { planOldPatientHistory, writeOldPatientHistory } from '../migration/migration.service.ts';
import { patientService } from '../patient/patient.service.ts';
import { settingsService } from '../settings/settings.service.ts';
import { resolveProcedureLines } from './procedure.rules.ts';
import type { AddHistoricalProceduresInput, AddOldVisitInput } from './procedure.schema.ts';

/** English, for logs and for the appointment detail screen if anyone opens one. */
const OLD_VISIT_NOTE = 'Entered after the day it happened';

/**
 * Midday on the day this names, in UTC — the same stamp the imported rows use
 * and for the same reason: an old visit records *which day*, not which slot, so
 * it has to read back as that day from any offset. See `migration.service`.
 */
function noonUtc(date: string): Date {
    return new Date(`${date}T12:00:00.000Z`);
}

export interface AddedOldVisit {
    appointmentId: string;
    visitId: string;
    /** What the visit was charged, in piastres. The patient owes it until it is settled. */
    chargedTotal: number;
}

export interface AddedHistoricalProcedures {
    /** One per day the lines were grouped into — the file's afternoons, not its lines. */
    appointmentIds: string[];
}

export const procedureHistoryService = {
    /**
     * The patient is resolved before anything is planned, so a bad id answers
     * `NOT_FOUND` rather than a catalogue or configuration error about a record
     * that does not exist.
     */
    async add(input: AddHistoricalProceduresInput): Promise<AddedHistoricalProcedures> {
        await patientService.requireExists(input.patientId);

        const plan = await planOldPatientHistory({ procedures: input.procedures });
        // `min(1)` on the input means the only way here is an empty plan, which
        // cannot happen; the guard is for the type, not for a case.
        if (!plan) return { appointmentIds: [] };

        const write = await db.transaction((tx) => writeOldPatientHistory(tx, input.patientId, plan));

        return { appointmentIds: write.importedAppointmentIds };
    },

    /**
     * A visit that happened on a day that has passed and never got typed in.
     *
     * This is **not** a historical procedure, and the difference is money. The
     * work was done here, so it lands as an ordinary completed visit: it is
     * charged, the patient owes it, and the day it names counts it. The only
     * thing it does not have is a time of day, because the desk is recording
     * which day it was rather than which slot.
     *
     * `done` is what makes a past date writable at all: `appointments_no_overlap`
     * applies only to `booked` and `checked_in`, so a day that is already full
     * of real appointments still takes one of these, and two of them on the same
     * day do not collide with each other.
     *
     * Nothing is paid here. It goes on the record owing, and the desk settles it
     * through `balance.settle` like any other debt — this app has one place
     * money is taken and this is not a second one.
     */
    async addOldVisit(input: AddOldVisitInput): Promise<AddedOldVisit> {
        await patientService.requireExists(input.patientId);

        // A visit that has not happened is not a record of anything. Dates
        // compare as strings in ISO.
        if (input.performedOn > todayKey()) {
            throw new AppError(
                ERROR_CODE.VALIDATION,
                'an old visit has to be dated on a day that has happened',
                422,
            );
        }

        // §5's rules, the same ones a visit and a booking answer to.
        const lines = await resolveProcedureLines(input.procedures);

        const branchId = input.branchId ?? (await defaultBranchId());
        const { defaultDuration } = await settingsService.get();

        const at = noonUtc(input.performedOn);
        const priced = lines.map((line, i) => ({
            procedureId: line.procedure.id,
            quantity: line.quantity,
            // The caller's price, or the catalogue's — `visit.setProcedures`
            // resolves it the same way, and the snapshot is taken here either
            // way so a later price change cannot rewrite this visit (§7).
            unitPrice: input.procedures[i]?.unitPrice ?? line.procedure.defaultPrice,
            tooth: line.tooth,
            note: line.note,
        }));

        const chargedTotal = priced.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

        // `insertWithRef` is imported here rather than at the top of the file
        // for the reason `migration.service` gives: a static import would close
        // a cycle through `appointment.service` and `patient.service`.
        const { insertWithRef } = await import('../appointment/appointment.service.ts');

        const written = await db.transaction(async (tx) => {
            const appointment = await insertWithRef(
                tx,
                {
                    patientId: input.patientId,
                    branchId,
                    startsAt: at,
                    durationMinutes: defaultDuration,
                    status: 'done',
                    channel: 'desk',
                    note: OLD_VISIT_NOTE,
                },
                0,
            );

            const [visit] = await tx
                .insert(visits)
                .values({
                    id: Bun.randomUUIDv7(),
                    appointmentId: appointment.id,
                    // Every moment the visit records is the day itself. Nobody
                    // waited and nobody was in the chair now, but the columns
                    // are the record of a visit that did happen.
                    checkedInAt: at,
                    inChairAt: at,
                    pricedAt: at,
                    completedAt: at,
                    computedTotal: chargedTotal,
                    chargedTotal,
                })
                .returning();

            if (!visit) throw AppError.internal('old visit insert returned nothing');

            await tx
                .insert(visitProcedures)
                .values(priced.map((line) => ({ id: Bun.randomUUIDv7(), visitId: visit.id, ...line })));

            return { appointmentId: appointment.id, visitId: visit.id };
        });

        broadcast(WS_EVENT.VISIT_UPDATED, { id: written.visitId });

        return { ...written, chargedTotal };
    },
};

/**
 * Where an old visit hangs when the caller does not name a branch. `branch_id`
 * is NOT NULL and a clinic with one branch should not be made to answer a
 * question it has only one answer to; the list is ordered by name, so the
 * fallback is stable rather than whichever row came back first.
 */
async function defaultBranchId(): Promise<string> {
    const [branch] = await branchService.list();
    if (!branch) throw AppError.notFound('branch');
    return branch.id;
}
