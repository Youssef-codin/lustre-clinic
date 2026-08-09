import { DEFAULT_CLINIC_NAME, DEFAULT_REMINDER_TEMPLATE, ERROR_CODE, WS_EVENT } from '@mawid/shared';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { clinicDays, settings } from '../../db/schema.ts';
import { AppError } from '../../errors/AppError.ts';
import { broadcast } from '../../ws/index.ts';
import { branchService } from '../branch/branch.service.ts';
import type { SetClinicDayInput, UpdateSettingsInput } from './settings.schema.ts';

/**
 * SPEC §12. One enforced row (§5), seeded on first read so a fresh database is
 * usable without a manual step.
 *
 * `reminder_dismissed_on` lives here too (§11): the daily notification's repeat
 * is suppressed while it equals today. Reminder logic reads it through this
 * service rather than touching the row itself.
 */

export interface Settings {
    clinicName: string;
    clinicPhone: string | null;
    durationOptions: number[];
    defaultDuration: number;
    reminderLeadHours: number;
    reminderNotifyAt: string;
    reminderRepeatMinutes: number;
    reminderDismissedOn: string | null;
    reminderTemplate: string;
    updatedAt: Date;
}

type SettingsRow = typeof settings.$inferSelect;

/** Postgres returns `time` as `HH:MM:SS`; the client wants `HH:MM`. */
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
        updatedAt: row.updatedAt,
    };
}

async function readRow(): Promise<SettingsRow> {
    const [existing] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
    if (existing) return existing;

    // Seed. `onConflictDoNothing` covers two boots racing on an empty database.
    await db
        .insert(settings)
        .values({ id: 1, clinicName: DEFAULT_CLINIC_NAME, reminderTemplate: DEFAULT_REMINDER_TEMPLATE })
        .onConflictDoNothing();

    const [seeded] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
    if (!seeded) throw AppError.internal('settings row could not be seeded');
    return seeded;
}

/**
 * MAW-1. The weekly schedule the day view draws its bounds from, and the
 * booking screen takes its default branch from. A weekday with no row is a
 * closed day — rendered as closed, not as an empty schedule.
 *
 * The schedule only ever supplies a default: booking outside opening hours is
 * the secretary's call, so nothing here blocks an appointment.
 */
export interface ClinicDay {
    /** 0 = Sunday … 6 = Saturday, matching `Date#getDay`. */
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

    /** Called at boot so the row exists before anything else asks for it. */
    async ensureSeeded(): Promise<void> {
        await readRow();
    },

    async update(input: UpdateSettingsInput): Promise<Settings> {
        const current = await readRow();

        const durationOptions = input.durationOptions
            ? [...new Set(input.durationOptions)].sort((a, b) => a - b)
            : [...current.durationOptions].sort((a, b) => a - b);
        const defaultDuration = input.defaultDuration ?? current.defaultDuration;

        // The picker offers `durationOptions` and preselects `defaultDuration`
        // (§7), so a default outside the list would be unpickable.
        if (!durationOptions.includes(defaultDuration)) {
            throw new AppError(
                ERROR_CODE.INVALID_DURATION,
                'defaultDuration must be one of durationOptions',
                422,
            );
        }

        const [updated] = await db
            .update(settings)
            .set({
                ...input,
                durationOptions,
                defaultDuration,
                updatedAt: new Date(),
            })
            .where(eq(settings.id, 1))
            .returning();

        if (!updated) throw AppError.notFound('settings');

        broadcast(WS_EVENT.SETTINGS_UPDATED);
        return toSettings(updated);
    },

    /** MAW-1 — every open weekday, ascending. Missing weekdays are closed. */
    async schedule(): Promise<ClinicDay[]> {
        const rows = await db.select().from(clinicDays).orderBy(asc(clinicDays.weekday));
        return rows.map(toClinicDay);
    },

    /** The day's hours, or null when the clinic is closed that weekday. */
    async dayFor(weekday: number): Promise<ClinicDay | null> {
        const [row] = await db.select().from(clinicDays).where(eq(clinicDays.weekday, weekday)).limit(1);
        return row ? toClinicDay(row) : null;
    },

    /** Sets or replaces a weekday's branch and hours. */
    async setDay(input: SetClinicDayInput): Promise<ClinicDay> {
        // Fails with NOT_FOUND before Postgres would fail with a foreign key
        // violation, so the client gets a code it can localize.
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

    /** Marks a weekday closed by removing its row. Closing a closed day is a no-op. */
    async clearDay(weekday: number): Promise<void> {
        await db.delete(clinicDays).where(eq(clinicDays.weekday, weekday));
        broadcast(WS_EVENT.SETTINGS_UPDATED);
    },

    /**
     * §11 — silences the repeating notification until tomorrow. `date` is the
     * clinic's local date as the client sees it; the server does not guess a
     * timezone on its behalf.
     */
    async dismissRemindersFor(date: string): Promise<Settings> {
        await readRow();

        const [updated] = await db
            .update(settings)
            .set({ reminderDismissedOn: date, updatedAt: new Date() })
            .where(eq(settings.id, 1))
            .returning();

        if (!updated) throw AppError.notFound('settings');

        broadcast(WS_EVENT.SETTINGS_UPDATED);
        return toSettings(updated);
    },
};
