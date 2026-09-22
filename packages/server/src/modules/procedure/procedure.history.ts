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
import { db } from '../../db/index.ts';
import { planOldPatientHistory, writeOldPatientHistory } from '../migration/migration.service.ts';
import { patientService } from '../patient/patient.service.ts';
import type { AddHistoricalProceduresInput } from './procedure.schema.ts';

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
};
