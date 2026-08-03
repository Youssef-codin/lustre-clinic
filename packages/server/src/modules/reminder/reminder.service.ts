import { REMINDER_PLACEHOLDERS } from '@mawid/shared';
import { and, asc, eq, lte } from 'drizzle-orm';
import { db, type Executor } from '../../db/index.ts';
import { appointments, patients, reminders } from '../../db/schema.ts';
import { AppError } from '../../errors/AppError.ts';
import { toWhatsAppNumber } from '../../util/phone.ts';
import { settingsService } from '../settings/settings.service.ts';
import type { DismissTodayInput, PendingRemindersInput } from './reminder.schema.ts';

/**
 * SPEC §11. No automated sending: a row is created on booking, the screen lists
 * what is pending, and the user marks each one sent or skipped after opening
 * WhatsApp. Delivery cannot be confirmed, so nothing here may depend on whether
 * the message actually went out.
 */

export type Reminder = typeof reminders.$inferSelect;

export interface PendingReminder {
    id: string;
    appointmentId: string;
    dueAt: Date;
    startsAt: Date;
    ref: string;
    patient: { id: string; name: string; phone: string };
    /** Ready to hand to `Linking.openURL` (§11). */
    whatsAppUrl: string;
    message: string;
}

/** `{{name}}` and friends. An unknown placeholder is left visible, not dropped. */
export function renderTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
        (REMINDER_PLACEHOLDERS as readonly string[]).includes(key) ? (values[key] ?? whole) : whole,
    );
}

export const reminderService = {
    /**
     * §11 — created on booking, `due_at = starts_at - reminder_lead_hours`.
     * Runs inside the booking transaction so an appointment can never exist
     * without its reminder.
     */
    async scheduleFor(
        executor: Executor,
        appointment: { id: string; startsAt: Date },
        leadHours: number,
    ): Promise<void> {
        const dueAt = new Date(appointment.startsAt.getTime() - leadHours * 3_600_000);

        await executor
            .insert(reminders)
            .values({ id: Bun.randomUUIDv7(), appointmentId: appointment.id, dueAt })
            .onConflictDoUpdate({ target: reminders.appointmentId, set: { dueAt } });
    },

    /** Follows a rescheduled appointment (§7). */
    async reschedule(executor: Executor, appointmentId: string, startsAt: Date): Promise<void> {
        const { reminderLeadHours } = await settingsService.get();
        await executor
            .update(reminders)
            .set({ dueAt: new Date(startsAt.getTime() - reminderLeadHours * 3_600_000) })
            .where(eq(reminders.appointmentId, appointmentId));
    },

    /**
     * A cancelled appointment's reminder is marked skipped rather than deleted:
     * the row is the record that no message was owed, and `appointment_id` is
     * UNIQUE, so a later reinstatement reuses it.
     */
    async skipFor(executor: Executor, appointmentId: string): Promise<void> {
        await executor
            .update(reminders)
            .set({ status: 'skipped' })
            .where(and(eq(reminders.appointmentId, appointmentId), eq(reminders.status, 'pending')));
    },

    async pending(input: PendingRemindersInput = { dueOnly: true, limit: 100 }): Promise<PendingReminder[]> {
        const settings = await settingsService.get();

        const rows = await db
            .select({
                id: reminders.id,
                appointmentId: reminders.appointmentId,
                dueAt: reminders.dueAt,
                startsAt: appointments.startsAt,
                ref: appointments.ref,
                status: appointments.status,
                patientId: patients.id,
                name: patients.name,
                phone: patients.phone,
            })
            .from(reminders)
            .innerJoin(appointments, eq(reminders.appointmentId, appointments.id))
            .innerJoin(patients, eq(appointments.patientId, patients.id))
            .where(
                and(
                    eq(reminders.status, 'pending'),
                    eq(appointments.status, 'booked'),
                    ...(input.dueOnly ? [lte(reminders.dueAt, new Date())] : []),
                ),
            )
            .orderBy(asc(reminders.dueAt))
            .limit(input.limit);

        return rows.map((row) => {
            const message = renderTemplate(settings.reminderTemplate, {
                name: row.name,
                clinic: settings.clinicName,
                date: row.startsAt.toISOString().slice(0, 10),
                time: row.startsAt.toISOString().slice(11, 16),
                ref: row.ref,
            });

            return {
                id: row.id,
                appointmentId: row.appointmentId,
                dueAt: row.dueAt,
                startsAt: row.startsAt,
                ref: row.ref,
                patient: { id: row.patientId, name: row.name, phone: row.phone },
                whatsAppUrl: `https://wa.me/${toWhatsAppNumber(row.phone)}?text=${encodeURIComponent(message)}`,
                message,
            };
        });
    },

    async markSent(id: string): Promise<Reminder> {
        const [row] = await db
            .update(reminders)
            .set({ status: 'sent', sentAt: new Date() })
            .where(eq(reminders.id, id))
            .returning();

        if (!row) throw AppError.notFound('reminder');
        return row;
    },

    async markSkipped(id: string): Promise<Reminder> {
        const [row] = await db
            .update(reminders)
            .set({ status: 'skipped' })
            .where(eq(reminders.id, id))
            .returning();

        if (!row) throw AppError.notFound('reminder');
        return row;
    },

    /** §11 — suppresses the repeating notification for the rest of the day. */
    async dismissToday(input: DismissTodayInput) {
        return settingsService.dismissRemindersFor(input.date);
    },
};
