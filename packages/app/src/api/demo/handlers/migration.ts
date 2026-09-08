/**
 * `server/src/modules/migration/migration.service.ts` — the screen the old
 * system's records are typed into.
 *
 * Deliberately not `patient.create`: that validates the whole questionnaire,
 * because a new registration is the form answered in one sitting, while a
 * migrated patient is a name and a number off a list whose answers are
 * collected the next time they are in the chair.
 *
 * A balance is derived and never stored, so debt carried over from before the
 * cutoff has nowhere of its own to live: it is given a synthetic appointment
 * and visit, dated at the cutoff, charged with what is owed and carrying no
 * procedures. `isOpeningBalance` is how the readers tell it apart. The
 * appointment is `done` rather than `booked` — `done` holds no slot, so four
 * hundred of them at the same instant do not collide.
 */
import type { RouterInput, RouterOutput } from '../../types';
import { getDb, save, type VisitRow } from '../db';
import { assertAmount, dayRange, uuidv7 } from '../rules';
import type { Dated } from '../wire';
import { insertAppointment } from './appointment';
import { branchHandlers } from './branch';
import { createMinimalPatient, toPatient } from './patient';

/** Nominal: nobody attended and the day view never draws these, but a duration must be positive. */
const SYNTHETIC_DURATION_MINUTES = 5;

const SYNTHETIC_NOTE = 'Opening balance carried over from the old system';

export const migrationHandlers = {
    enter(input: RouterInput['migration']['enter']): Dated<RouterOutput['migration']['enter']> {
        const { openingBalance, branchId, cutoffDate, offsetMinutes, ...details } = input;

        if (openingBalance !== undefined) assertAmount(openingBalance, 'opening balance');
        if (branchId !== undefined) branchHandlers.byId(branchId);

        const row = createMinimalPatient(details);

        if (openingBalance === undefined || branchId === undefined || cutoffDate === undefined) {
            save();
            return { patient: toPatient(row), openingBalanceVisitId: null };
        }

        const { from: at } = dayRange(cutoffDate, offsetMinutes ?? 0);

        const appointment = insertAppointment(
            {
                patientId: row.id,
                branchId,
                startsAt: at,
                durationMinutes: SYNTHETIC_DURATION_MINUTES,
                note: SYNTHETIC_NOTE,
                status: 'done',
                channel: 'desk',
                isOpeningBalance: true,
            },
            offsetMinutes ?? 0,
        );

        const visit: VisitRow = {
            id: uuidv7(),
            appointmentId: appointment.id,
            checkedInAt: at,
            inChairAt: null,
            // Settled from the moment it exists: there is nothing here to price,
            // and the amount is whatever the old system said.
            pricedAt: at,
            completedAt: at,
            computedTotal: openingBalance,
            chargedTotal: openingBalance,
            createdAt: at,
        };

        getDb().visits.push(visit);
        save();

        return { patient: toPatient(row), openingBalanceVisitId: visit.id };
    },

    /** `patients` is the whole register rather than this session's tally — the screen counts its own. */
    progress(): Dated<RouterOutput['migration']['progress']> {
        const db = getDb();

        const carried = db.visits.filter((visit) =>
            db.appointments.some((row) => row.id === visit.appointmentId && row.isOpeningBalance),
        );

        return {
            patients: db.patients.length,
            openingBalances: carried.length,
            openingBalanceTotal: carried.reduce((sum, visit) => sum + visit.chargedTotal, 0),
        };
    },
};
