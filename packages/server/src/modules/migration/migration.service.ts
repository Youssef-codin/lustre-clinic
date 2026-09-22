/**
 * What a patient who predates the cutoff brings with them: the money they
 * already owed, and whatever the paper file records they had done. It is
 * written by `patient.create` when the **Old patient** switch is on, and
 * nothing else writes it — the separate Settings → Data entry screen and its
 * `migration.enter` procedure are gone, because two ways to register an old
 * patient is how one of them ends up allocating a fresh number to someone who
 * already has one.
 *
 * ## Where it is dated
 *
 * `branch_id` is NOT NULL and a date has to be something, so both come from the
 * clinic's migration configuration (`settings.migration_branch_id`,
 * `settings.migration_cutoff_date`) rather than from the registration form. The
 * form asks for the patient; the cutoff is a fact about the clinic, answered
 * once. Without it nothing is written and the registration is refused, because
 * the alternative is inventing a branch and a day the clinic was open.
 *
 * ## Noon, and why these dates alone are not bounded by an offset
 *
 * Every other date this API takes arrives with an `offsetMinutes` and is turned
 * into a day's bounds, because the question is always "which local day does
 * this instant fall in" (§12, `dates.ts`). These rows ask the opposite: they
 * carry a day the clinic wrote on a paper file years ago, and all that has to
 * survive is the day being *read back*.
 *
 * Local midnight cannot do that. Egypt keeps DST, so an instant stored as
 * midnight under one offset is 23:00 the previous day under another — a
 * procedure dated 14 March 2024 and stamped with a summer offset reads as the
 * 13th. Getting it right would need the offset in force on each of those dates,
 * and the registration form has no way to know the one in force on a cutoff it
 * never sees.
 *
 * So they are stamped at **noon UTC** on the day they name, which reads back as
 * that same day at every offset strictly between −12 and +12 — Egypt is +2 or
 * +3, and only the date line's own zones fall outside that.
 * Nothing rounds these rows into a day's bounds, because nothing counts them:
 * the day view, revenue and statistics all exclude them by flag.
 *
 * ## Opening balances
 *
 * A balance is derived and never stored — `charged_total` minus payments, per
 * visit (§10) — so debt carried over from before the cutoff has nowhere of its
 * own to live. It is given a synthetic appointment and a synthetic visit, dated
 * at the cutoff, charged with what is owed and carrying no procedures. The
 * appointment is flagged `is_opening_balance`, which is how the readers tell it
 * apart: it is owed, so `balance.outstanding` and the patient's record count
 * it, but nothing was billed and nobody sat in the chair, so `balance.summary`,
 * `stats.summary` and the day view leave it out.
 *
 * ## Imported procedures
 *
 * Work the old system recorded is an appointment with planned procedures and
 * **no visit at all**, flagged `is_imported`. No visit is the whole trick: a
 * visit is where money lives, so a row without one cannot charge anything, owe
 * anything or be paid — it appears in the record's history and in no total. The
 * single figure a patient carries over is **Owes**, and it is the opening
 * balance.
 *
 * Lines are grouped by the day they were done, so a file recording three
 * procedures on one afternoon reads as one afternoon. Lines the file does not
 * date go into one row dated at the cutoff and flagged `date_unknown`, which
 * the record draws as *before migration* rather than reading the cutoff out as
 * though it were the day.
 *
 * Both synthetic appointments are `done` rather than `booked`. `done` does not
 * hold a slot, so four hundred of them at the same instant on the cutoff date
 * do not trip `appointments_no_overlap` — which is the only reason this fits
 * inside the existing model at all.
 *
 * Every part of this is written in the caller's transaction. A patient on file
 * owing nothing they actually owe is a wrong number told to them at the desk
 * months later, so if any of it cannot be written none of it is, the patient
 * included, and the row is typed again.
 */
import { ERROR_CODE } from '@lustre/shared';
import { count, eq, sql } from 'drizzle-orm';
import { db, type Executor } from '../../db/index.ts';
import { appointmentProcedures, appointments, patients, visits } from '../../db/schema.ts';
import { AppError } from '../../errors/AppError.ts';
import { assertAmount } from '../../util/money.ts';
import type { OldPatientInput } from '../patient/patient.schema.ts';
import type { ResolvedLine } from '../procedure/procedure.rules.ts';
import { resolveProcedureLines } from '../procedure/procedure.rules.ts';
import { settingsService } from '../settings/settings.service.ts';

/** Nominal. Nobody attended and the day view never draws these, but the column is NOT NULL and checked positive. */
const SYNTHETIC_DURATION_MINUTES = 5;

/** English, for logs and for the appointment detail screen if anyone ever opens one of these. */
const OPENING_BALANCE_NOTE = 'Opening balance carried over from the old system';
const IMPORTED_NOTE = 'Recorded by the old system before the migration';

/** One day off the paper file, or — when it does not say — everything it does not date. */
interface OldHistoryDay {
    performedOn: string | null;
    lines: ResolvedLine[];
}

/**
 * Everything the write needs, resolved and checked, before a transaction is
 * open. The catalogue reads and the configuration read are about the request
 * rather than the write, so they happen first — the same order booking uses.
 */
export interface OldPatientPlan {
    branchId: string;
    cutoffDate: string;
    openingBalance?: number;
    days: OldHistoryDay[];
}

/**
 * Midday on the day this names, in UTC. Read back through any offset strictly
 * between −12 and +12 it is still that day — which is the whole requirement
 * for a row that carries a date rather than occupying a slot. See the note at
 * the top.
 */
function noonUtc(date: string): Date {
    return new Date(`${date}T12:00:00.000Z`);
}

export interface OldPatientWrite {
    /** The synthetic visit carrying the opening balance, or null when they owed nothing. */
    openingBalanceVisitId: string | null;
    importedAppointmentIds: string[];
}

/**
 * Resolves what an old patient brings with them, and refuses it here if it
 * cannot be written — before the patient row exists, so there is nothing to
 * roll back.
 *
 * Nothing is needed when they arrive owing nothing and with an empty file: that
 * is a patient with an old number and no history, which is most of them, and
 * asking such a clinic to configure a cutoff first would be asking for a fact
 * nothing is about to use.
 */
export async function planOldPatientHistory(
    old: Pick<OldPatientInput, 'openingBalance' | 'procedures'>,
): Promise<OldPatientPlan | null> {
    if (old.openingBalance === undefined && old.procedures.length === 0) return null;

    if (old.openingBalance !== undefined) assertAmount(old.openingBalance, 'opening balance');

    const { migrationBranchId, migrationCutoffDate } = await settingsService.get();
    if (migrationBranchId === null || migrationCutoffDate === null) {
        throw new AppError(
            ERROR_CODE.MIGRATION_NOT_CONFIGURED,
            'an old patient with money owed or work done needs a migration branch and cutoff date',
            422,
        );
    }

    // A line dated after the cutoff was done here, not at the old clinic, and
    // an imported row is one every operational view leaves out. Refused rather
    // than quietly filed where nothing will count it. ISO dates compare as
    // strings.
    const afterCutoff = old.procedures.find(
        (line) => line.performedOn != null && line.performedOn > migrationCutoffDate,
    );
    if (afterCutoff) {
        throw new AppError(
            ERROR_CODE.IMPORTED_DATE_AFTER_CUTOFF,
            `an old procedure is dated ${afterCutoff.performedOn}, after the cutoff (${migrationCutoffDate})`,
            422,
        );
    }

    return {
        branchId: migrationBranchId,
        cutoffDate: migrationCutoffDate,
        ...(old.openingBalance === undefined ? {} : { openingBalance: old.openingBalance }),
        days: await resolveDays(old.procedures),
    };
}

/**
 * Grouped by the day the file gives, in the order the lines were typed. §5's
 * once-per-list rule is applied per day, which is what it means here: the same
 * tooth extracted on two different days is two real lines, and twice on one day
 * is the file being typed twice.
 */
async function resolveDays(procedures: OldPatientInput['procedures']): Promise<OldHistoryDay[]> {
    const byDay = new Map<string | null, OldPatientInput['procedures']>();

    for (const line of procedures) {
        const day = line.performedOn ?? null;
        const bucket = byDay.get(day);
        if (bucket) bucket.push(line);
        else byDay.set(day, [line]);
    }

    const days: OldHistoryDay[] = [];
    for (const [performedOn, lines] of byDay) {
        days.push({
            performedOn,
            lines: await resolveProcedureLines(
                lines.map((line) => ({
                    procedureId: line.procedureId,
                    quantity: line.quantity,
                    tooth: line.tooth ?? null,
                })),
            ),
        });
    }
    return days;
}

/**
 * Writes the plan against a patient that already exists, in the caller's
 * transaction. `insertWithRef` is imported here rather than at the top of the
 * file: `patient.create` calls into this module and `appointment.service`
 * imports `patient.service`, so a static import would close a cycle between the
 * three.
 */
export async function writeOldPatientHistory(
    tx: Executor,
    patientId: string,
    plan: OldPatientPlan,
): Promise<OldPatientWrite> {
    const { insertWithRef } = await import('../appointment/appointment.service.ts');

    const cutoffAt = noonUtc(plan.cutoffDate);

    let openingBalanceVisitId: string | null = null;

    if (plan.openingBalance !== undefined) {
        const appointment = await insertWithRef(
            tx,
            {
                patientId,
                branchId: plan.branchId,
                startsAt: cutoffAt,
                durationMinutes: SYNTHETIC_DURATION_MINUTES,
                status: 'done',
                isOpeningBalance: true,
                note: OPENING_BALANCE_NOTE,
            },
            0,
        );

        const [visit] = await tx
            .insert(visits)
            .values({
                id: Bun.randomUUIDv7(),
                appointmentId: appointment.id,
                checkedInAt: cutoffAt,
                // Settled from the moment it exists: there is nothing here
                // to price, and the amount is whatever the old system said.
                pricedAt: cutoffAt,
                completedAt: cutoffAt,
                computedTotal: plan.openingBalance,
                chargedTotal: plan.openingBalance,
            })
            .returning();

        if (!visit) throw AppError.internal('opening balance visit insert returned nothing');
        openingBalanceVisitId = visit.id;
    }

    const importedAppointmentIds: string[] = [];

    for (const day of plan.days) {
        const at = day.performedOn ? noonUtc(day.performedOn) : cutoffAt;

        const appointment = await insertWithRef(
            tx,
            {
                patientId,
                branchId: plan.branchId,
                startsAt: at,
                durationMinutes: SYNTHETIC_DURATION_MINUTES,
                status: 'done',
                isImported: true,
                dateUnknown: day.performedOn === null,
                note: IMPORTED_NOTE,
            },
            0,
        );

        await tx.insert(appointmentProcedures).values(
            day.lines.map((line, sortOrder) => ({
                id: Bun.randomUUIDv7(),
                appointmentId: appointment.id,
                procedureId: line.procedure.id,
                quantity: line.quantity,
                tooth: line.tooth,
                note: line.note,
                sortOrder,
            })),
        );

        importedAppointmentIds.push(appointment.id);
    }

    return { openingBalanceVisitId, importedAppointmentIds };
}

/** How far the changeover has got. Settings → Clinic draws it beside the cutoff it is dated at. */
interface MigrationProgress {
    patients: number;
    oldPatients: number;
    openingBalances: number;
    openingBalanceTotal: number;
}

export const migrationService = {
    /**
     * `patients` is the whole register rather than the old ones alone — the two
     * answer different questions: how many came across, and how many are on
     * file at all.
     */
    async progress(): Promise<MigrationProgress> {
        const [entered] = await db.select({ total: count() }).from(patients);

        const [old] = await db
            .select({ total: count() })
            .from(patients)
            .where(sql`${patients.legacyRef} IS NOT NULL`);

        const [carried] = await db
            .select({
                total: count(),
                amount: sql<number>`COALESCE(SUM(${visits.chargedTotal}), 0)::int`,
            })
            .from(visits)
            .innerJoin(appointments, eq(visits.appointmentId, appointments.id))
            .where(eq(appointments.isOpeningBalance, true));

        return {
            patients: entered?.total ?? 0,
            oldPatients: old?.total ?? 0,
            openingBalances: carried?.total ?? 0,
            openingBalanceTotal: carried?.amount ?? 0,
        };
    },
};
