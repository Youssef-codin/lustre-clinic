/**
 * `server/src/modules/migration/migration.service.ts` — what a patient who
 * predates the cutoff brings with them, written by `patient.create` when the
 * **Old patient** switch is on. There is no `enter` procedure any more: two
 * ways to register an old patient is how one of them ends up allocating a fresh
 * number to somebody who already has one.
 *
 * A balance is derived and never stored, so debt carried over from before the
 * cutoff has nowhere of its own to live: it is given a synthetic appointment
 * and visit, dated at the cutoff, charged with what is owed and carrying no
 * procedures. `isOpeningBalance` is how the readers tell it apart.
 *
 * Work the old system recorded is an appointment with planned procedures and no
 * visit at all, flagged `isImported` — no visit is the trick, because a visit is
 * where money lives, so the row appears in the record's history and in no total.
 * Lines are grouped by the day the file gives; the ones it does not date go into
 * one row flagged `dateUnknown`.
 *
 * Both are `done` rather than `booked` — `done` holds no slot, so four hundred
 * of them at the same instant do not collide.
 */
import { ERROR_CODE } from '@lustre/shared';
import type { RouterInput, RouterOutput } from '../../types';
import { type AppointmentProcedureRow, getDb, type VisitRow } from '../db';
import { assertAmount, DemoError, uuidv7 } from '../rules';
import type { Dated } from '../wire';
import { insertAppointment } from './appointment';
import { branchHandlers } from './branch';

type OldPatientInput = NonNullable<RouterInput['patient']['create']['old']>;

/** The schema defaults it; the *input* type does not, because a caller may leave it out. */
type OldProcedures = NonNullable<OldPatientInput['procedures']>;

/** Nominal: nobody attended and the day view never draws these, but a duration must be positive. */
const SYNTHETIC_DURATION_MINUTES = 5;

const OPENING_BALANCE_NOTE = 'Opening balance carried over from the old system';
const IMPORTED_NOTE = 'Recorded by the old system before the migration';

/**
 * Everything the write needs, checked before a row is touched — the same order
 * the server resolves it in, so a demo refuses what the clinic would refuse.
 */
/**
 * Midday on the day this names, in UTC — the same trick the server uses. These
 * rows carry a date rather than occupying a slot, and noon reads back as that
 * day at every offset there is. See `migration.service`.
 */
function noonUtc(date: string): Date {
    return new Date(`${date}T12:00:00.000Z`);
}

export function planOldPatientHistory(old: OldPatientInput): {
    branchId: string;
    cutoffDate: string;
    openingBalance?: number;
    days: Array<{ performedOn: string | null; lines: OldProcedures }>;
} | null {
    const procedures: OldProcedures = old.procedures ?? [];

    if (old.openingBalance === undefined && procedures.length === 0) return null;

    if (old.openingBalance !== undefined) assertAmount(old.openingBalance, 'opening balance');

    const { migrationBranchId, migrationCutoffDate } = getDb().settings;
    if (migrationBranchId === null || migrationCutoffDate === null) {
        throw new DemoError(
            ERROR_CODE.MIGRATION_NOT_CONFIGURED,
            'an old patient with money owed or work done needs a migration branch and cutoff date',
            422,
        );
    }
    branchHandlers.byId(migrationBranchId);

    const byDay = new Map<string | null, OldProcedures>();
    for (const line of procedures) {
        const day = line.performedOn ?? null;
        const bucket = byDay.get(day);
        if (bucket) bucket.push(line);
        else byDay.set(day, [line]);
    }

    return {
        branchId: migrationBranchId,
        cutoffDate: migrationCutoffDate,
        ...(old.openingBalance === undefined ? {} : { openingBalance: old.openingBalance }),
        days: [...byDay].map(([performedOn, lines]) => ({ performedOn, lines })),
    };
}

/** Writes a resolved plan against a patient that already exists. */
export function writeOldPatientHistory(
    patientId: string,
    plan: NonNullable<ReturnType<typeof planOldPatientHistory>>,
): void {
    const db = getDb();
    const cutoffAt = noonUtc(plan.cutoffDate);

    if (plan.openingBalance !== undefined) {
        const appointment = insertAppointment(
            {
                patientId,
                branchId: plan.branchId,
                startsAt: cutoffAt,
                durationMinutes: SYNTHETIC_DURATION_MINUTES,
                note: OPENING_BALANCE_NOTE,
                status: 'done',
                channel: 'desk',
                isOpeningBalance: true,
                isImported: false,
                dateUnknown: false,
            },
            0,
        );

        const visit: VisitRow = {
            id: uuidv7(),
            appointmentId: appointment.id,
            checkedInAt: cutoffAt,
            inChairAt: null,
            // Settled from the moment it exists: there is nothing here to price,
            // and the amount is whatever the old system said.
            pricedAt: cutoffAt,
            completedAt: cutoffAt,
            computedTotal: plan.openingBalance,
            chargedTotal: plan.openingBalance,
            createdAt: cutoffAt,
        };
        db.visits.push(visit);
    }

    for (const day of plan.days) {
        const at = day.performedOn ? noonUtc(day.performedOn) : cutoffAt;

        const appointment = insertAppointment(
            {
                patientId,
                branchId: plan.branchId,
                startsAt: at,
                durationMinutes: SYNTHETIC_DURATION_MINUTES,
                note: IMPORTED_NOTE,
                status: 'done',
                channel: 'desk',
                isOpeningBalance: false,
                isImported: true,
                dateUnknown: day.performedOn === null,
            },
            0,
        );

        const lines: AppointmentProcedureRow[] = day.lines.map((line, sortOrder) => ({
            id: uuidv7(),
            appointmentId: appointment.id,
            procedureId: line.procedureId,
            quantity: line.quantity ?? 1,
            tooth: line.tooth ?? null,
            note: null,
            sortOrder,
        }));
        db.appointmentProcedures.push(...lines);
    }
}

export const migrationHandlers = {
    /** `patients` is the whole register; `oldPatients` is how many came across. */
    progress(): Dated<RouterOutput['migration']['progress']> {
        const db = getDb();

        const carried = db.visits.filter((visit) =>
            db.appointments.some((row) => row.id === visit.appointmentId && row.isOpeningBalance),
        );

        return {
            patients: db.patients.length,
            oldPatients: db.patients.filter((row) => row.legacyRef !== null).length,
            openingBalances: carried.length,
            openingBalanceTotal: carried.reduce((sum, visit) => sum + visit.chargedTotal, 0),
        };
    },
};
