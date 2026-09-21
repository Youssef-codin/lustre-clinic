/**
 * SPEC §12. One enforced row (§5), seeded on first read so a fresh database is
 * usable without a manual step.
 *
 * `reminder_dismissed_on` lives here too (§11): the daily notification's repeat
 * is suppressed while it equals today. Reminder logic reads it through this
 * service rather than touching the row itself.
 *
 * Postgres returns `time` as `HH:MM:SS`, so rows are trimmed to `HH:MM` for the
 * client. Seeding uses `onConflictDoNothing` to cover two boots racing on an
 * empty database. `defaultDuration` must stay inside `durationOptions` or the
 * picker would offer an unpickable default, and `setDay` resolves the branch
 * first so the client gets a localizable `NOT_FOUND` rather than a foreign-key
 * violation.
 *
 * `patient_ref_next` is the number the next *new* patient is given. It was
 * `patient_ref_last` — the number already handed out — and the field was read
 * as this one by everybody who typed into it, which is how a clinic that typed
 * 910 got 911. An old patient keeps their own number and never moves it.
 */
import { DEFAULT_CLINIC_NAME, DEFAULT_REMINDER_TEMPLATE, ERROR_CODE, WS_EVENT } from '@lustre/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { db, type Executor } from '../../db/index.ts';
import { clinicDays, patients, settings } from '../../db/schema.ts';
import { AppError } from '../../errors/AppError.ts';
import { highestNumericRef } from '../../util/ref.ts';
import { broadcast } from '../../ws/index.ts';
import { branchService } from '../branch/branch.service.ts';
import type { SetClinicDayInput, UpdateSettingsInput } from './settings.schema.ts';

interface Settings {
    clinicName: string;
    clinicPhone: string | null;
    durationOptions: number[];
    defaultDuration: number;
    reminderLeadHours: number;
    reminderNotifyAt: string;
    reminderRepeatMinutes: number;
    reminderDismissedOn: string | null;
    reminderTemplate: string;
    /** The number the next new patient is given — handed out as it stands, not one more. */
    patientRefNext: number;
    /** Where an old patient's carried-over money and history are dated. Null until the clinic says. */
    migrationBranchId: string | null;
    migrationCutoffDate: string | null;
    updatedAt: Date;
}

type SettingsRow = typeof settings.$inferSelect;

function toSettings(row: SettingsRow): Settings {
    return {
        clinicName: row.clinicName,
        clinicPhone: row.clinicPhone,
        durationOptions: [...row.durationOptions].sort((a, b) => a - b),
        defaultDuration: row.defaultDuration,
        reminderLeadHours: row.reminderLeadHours,
        reminderNotifyAt: row.reminderNotifyAt.slice(0, 5),
        reminderRepeatMinutes: row.reminderRepeatMinutes,
        reminderDismissedOn: row.reminderDismissedOn,
        reminderTemplate: row.reminderTemplate,
        patientRefNext: row.patientRefNext,
        migrationBranchId: row.migrationBranchId,
        migrationCutoffDate: row.migrationCutoffDate,
        updatedAt: row.updatedAt,
    };
}

async function readRow(): Promise<SettingsRow> {
    const [existing] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
    if (existing) return existing;

    await db
        .insert(settings)
        .values({ id: 1, clinicName: DEFAULT_CLINIC_NAME, reminderTemplate: DEFAULT_REMINDER_TEMPLATE })
        .onConflictDoNothing();

    const [seeded] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
    if (!seeded) throw AppError.internal('settings row could not be seeded');
    return seeded;
}

/** Every write to the row stamps `updatedAt`. */
async function updateRow(
    values: Partial<typeof settings.$inferInsert>,
    executor: Executor = db,
): Promise<SettingsRow> {
    const [updated] = await executor
        .update(settings)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(settings.id, 1))
        .returning();

    if (!updated) throw AppError.notFound('settings');
    return updated;
}

/** A write, then the handsets are told to refetch. */
async function writeRow(values: Partial<typeof settings.$inferInsert>): Promise<Settings> {
    const updated = await updateRow(values);
    broadcast(WS_EVENT.SETTINGS_UPDATED);
    return toSettings(updated);
}

/**
 * Refuses a next patient number at or below the highest all-digit ref on file:
 * the next registration would be handed a number a patient already has. Old
 * random codes count when they happen to be all digits (`2345`), and so does an
 * old patient's own number, which is their `ref` (§5).
 *
 * At, not merely below: this value is handed out as it stands now, where
 * `patient_ref_last` was handed out plus one.
 */
async function assertPatientRefNext(value: number, executor: Executor): Promise<void> {
    const highest = await highestTakenRef(executor);

    if (value <= highest) {
        throw new AppError(
            ERROR_CODE.PATIENT_REF_BELOW_EXISTING,
            `patientRefNext must be above ${highest}, the highest patient ref in use`,
            422,
        );
    }
}

async function highestTakenRef(executor: Executor): Promise<number> {
    const taken = await executor
        .select({ ref: patients.ref })
        .from(patients)
        .where(sql`${patients.ref} ~ '^[0-9]+$'`);

    return highestNumericRef(taken.map((row) => row.ref));
}

interface ClinicDay {
    weekday: number;
    branchId: string;
    opensAt: string;
    closesAt: string;
}

type ClinicDayRow = typeof clinicDays.$inferSelect;

function toClinicDay(row: ClinicDayRow): ClinicDay {
    return {
        weekday: row.weekday,
        branchId: row.branchId,
        opensAt: row.opensAt.slice(0, 5),
        closesAt: row.closesAt.slice(0, 5),
    };
}

export const settingsService = {
    async get(): Promise<Settings> {
        return toSettings(await readRow());
    },

    async ensureSeeded(): Promise<void> {
        await readRow();
    },

    async update(input: UpdateSettingsInput): Promise<Settings> {
        const current = await readRow();

        const durationOptions = input.durationOptions
            ? [...new Set(input.durationOptions)].sort((a, b) => a - b)
            : [...current.durationOptions].sort((a, b) => a - b);
        const defaultDuration = input.defaultDuration ?? current.defaultDuration;

        if (!durationOptions.includes(defaultDuration)) {
            throw new AppError(
                ERROR_CODE.INVALID_DURATION,
                'defaultDuration must be one of durationOptions',
                422,
            );
        }

        // A branch that is not on file would otherwise reach the client as a
        // foreign-key violation instead of a localizable NOT_FOUND.
        if (input.migrationBranchId) await branchService.byId(input.migrationBranchId);

        if (input.patientRefNext === undefined) {
            return writeRow({ ...input, durationOptions, defaultDuration });
        }

        const patientRefNext = input.patientRefNext;
        const updated = await db.transaction(async (tx) => {
            // The row lock comes first, so a registration already numbering
            // itself either commits before the refs are read or waits until
            // this has been written.
            await tx.select({ id: settings.id }).from(settings).where(eq(settings.id, 1)).for('update');
            await assertPatientRefNext(patientRefNext, tx);
            return updateRow({ ...input, durationOptions, defaultDuration }, tx);
        });

        broadcast(WS_EVENT.SETTINGS_UPDATED);
        return toSettings(updated);
    },

    async schedule(): Promise<ClinicDay[]> {
        const rows = await db.select().from(clinicDays).orderBy(asc(clinicDays.weekday));
        return rows.map(toClinicDay);
    },

    async dayFor(weekday: number): Promise<ClinicDay | null> {
        const [row] = await db.select().from(clinicDays).where(eq(clinicDays.weekday, weekday)).limit(1);
        return row ? toClinicDay(row) : null;
    },

    async setDay(input: SetClinicDayInput): Promise<ClinicDay> {
        await branchService.byId(input.branchId);

        const [row] = await db
            .insert(clinicDays)
            .values(input)
            .onConflictDoUpdate({
                target: clinicDays.weekday,
                set: { branchId: input.branchId, opensAt: input.opensAt, closesAt: input.closesAt },
            })
            .returning();

        if (!row) throw AppError.internal('clinic day upsert returned nothing');

        broadcast(WS_EVENT.SETTINGS_UPDATED);
        return toClinicDay(row);
    },

    async clearDay(weekday: number): Promise<void> {
        await db.delete(clinicDays).where(eq(clinicDays.weekday, weekday));
        broadcast(WS_EVENT.SETTINGS_UPDATED);
    },

    async dismissRemindersFor(date: string): Promise<Settings> {
        await readRow();
        return writeRow({ reminderDismissedOn: date });
    },
};
