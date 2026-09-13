/**
 * SPEC §12. One enforced row (§5), seeded on first read so a fresh database is
 * usable without a manual step.
 *
 * `reminder_dismissed_on` lives here too (§11): the daily notification's repeat
 * is suppressed while it equals today. Reminder logic reads it through this
 * service rather than touching the row itself.
 *
 * How a row reads and the duration rule are in `@lustre/shared`, shared with the
 * demo backend. Seeding uses `onConflictDoNothing` to cover two boots racing on
 * an empty database, and `setDay` resolves the branch first so the client gets a
 * localizable `NOT_FOUND` rather than a foreign-key violation.
 */
import {
    assertPatientRefLast,
    type ClinicDay,
    DEFAULT_CLINIC_NAME,
    DEFAULT_REMINDER_TEMPLATE,
    highestNumericRef,
    resolveDurations,
    type Settings,
    toClinicDay,
    toSettings,
    WS_EVENT,
} from '@lustre/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { clinicDays, patients, settings } from '../../db/schema.ts';
import { AppError, appFail } from '../../errors/AppError.ts';
import { broadcast } from '../../ws/index.ts';
import { branchService } from '../branch/branch.service.ts';
import type { SetClinicDayInput, UpdateSettingsInput } from './settings.schema.ts';

type SettingsRow = typeof settings.$inferSelect;

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

export const settingsService = {
    async get(): Promise<Settings> {
        return toSettings(await readRow());
    },

    async ensureSeeded(): Promise<void> {
        await readRow();
    },

    async update(input: UpdateSettingsInput): Promise<Settings> {
        const current = await readRow();

        const { durationOptions, defaultDuration } = resolveDurations(input, current, appFail);

        const updated = await db.transaction(async (tx) => {
            if (input.patientRefLast !== undefined) {
                // The row lock comes first, so a registration already numbering
                // itself either commits before the highest ref is read or waits
                // until this has been written.
                await tx.select({ id: settings.id }).from(settings).where(eq(settings.id, 1)).for('update');

                const [taken] = await tx
                    .select({ refs: sql<string[]>`coalesce(array_agg(${patients.ref}), '{}')` })
                    .from(patients)
                    .where(sql`${patients.ref} ~ '^[0-9]+$'`);

                assertPatientRefLast(input.patientRefLast, highestNumericRef(taken?.refs ?? []), appFail);
            }

            const [row] = await tx
                .update(settings)
                .set({
                    ...input,
                    durationOptions,
                    defaultDuration,
                    updatedAt: new Date(),
                })
                .where(eq(settings.id, 1))
                .returning();
            return row;
        });

        if (!updated) throw AppError.notFound('settings');

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
