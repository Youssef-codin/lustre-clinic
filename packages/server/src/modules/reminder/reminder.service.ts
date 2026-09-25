/**
 * SPEC §11. No automated sending: a row is created on booking, the screen lists
 * what is pending, and the user marks each one sent or skipped after opening
 * WhatsApp. Delivery cannot be confirmed, so nothing here may depend on whether
 * the message actually went out.
 *
 * `scheduleFor` runs inside the booking transaction so an appointment can never
 * exist without its reminder. A cancelled appointment's reminder is marked
 * skipped rather than deleted — the row is the record that no message was owed,
 * and `appointment_id` is UNIQUE so a later reinstatement reuses it. Message
 * times are shifted into the clinic's local day before formatting, because
 * `startsAt` is UTC. An unknown `{{placeholder}}` is left visible, not dropped.
 */
import { type LabStatus, REMINDER_PLACEHOLDERS, type WhatsAppApp, WS_EVENT } from '@lustre/shared';
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import { db, type Executor } from '../../db/index.ts';
import { appointments, branches, patients, reminders } from '../../db/schema.ts';
import { AppError } from '../../errors/AppError.ts';
import { toWhatsAppNumber } from '../../util/phone.ts';
import { broadcast } from '../../ws/index.ts';
import { settingsService } from '../settings/settings.service.ts';
import type { DismissTodayInput, PendingRemindersInput } from './reminder.schema.ts';

type Reminder = typeof reminders.$inferSelect;

interface PendingReminder {
    id: string;
    appointmentId: string;
    dueAt: Date;
    startsAt: Date;
    ref: string;
    patient: { id: string; name: string; phone: string };
    whatsAppUrl: string;
    /** The app the appointment's branch messages from. */
    whatsappApp: WhatsAppApp;
    message: string;
    /** `pending` means the visit's lab work is not back yet: confirm it before the patient. */
    labStatus: LabStatus | null;
}

export function renderTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
        (REMINDER_PLACEHOLDERS as readonly string[]).includes(key) ? (values[key] ?? whole) : whole,
    );
}

export const reminderService = {
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

    async reschedule(
        executor: Executor,
        appointmentId: string,
        startsAt: Date,
        leadHours: number,
    ): Promise<void> {
        await executor
            .update(reminders)
            .set({ dueAt: new Date(startsAt.getTime() - leadHours * 3_600_000) })
            .where(eq(reminders.appointmentId, appointmentId));
    },

    /**
     * A new lead time applied to the reminders already booked. Bounded to what
     * the pending list is actually made of — pending, on an appointment still
     * booked — and to appointments still ahead: an appointment already past is
     * a message that was owed at the old lead and either went out or did not,
     * and moving its `due_at` would only rewrite that history.
     */
    async rescheduleAllPending(executor: Executor, leadHours: number): Promise<void> {
        await executor
            .update(reminders)
            .set({ dueAt: sql`${appointments.startsAt} - make_interval(hours => ${leadHours})` })
            .from(appointments)
            .where(
                and(
                    eq(reminders.appointmentId, appointments.id),
                    eq(reminders.status, 'pending'),
                    eq(appointments.status, 'booked'),
                    gt(appointments.startsAt, sql`now()`),
                ),
            );
    },

    async skipFor(executor: Executor, appointmentId: string): Promise<void> {
        await executor
            .update(reminders)
            .set({ status: 'skipped' })
            .where(and(eq(reminders.appointmentId, appointmentId), eq(reminders.status, 'pending')));
    },

    async pending(
        input: PendingRemindersInput = { dueOnly: true, limit: 100, offsetMinutes: 0 },
    ): Promise<PendingReminder[]> {
        const settings = await settingsService.get();

        const rows = await db
            .select({
                id: reminders.id,
                appointmentId: reminders.appointmentId,
                dueAt: reminders.dueAt,
                startsAt: appointments.startsAt,
                ref: appointments.ref,
                status: appointments.status,
                labStatus: appointments.labStatus,
                patientId: patients.id,
                name: patients.name,
                phone: patients.phone,
                whatsappApp: branches.whatsappApp,
            })
            .from(reminders)
            .innerJoin(appointments, eq(reminders.appointmentId, appointments.id))
            .innerJoin(patients, eq(appointments.patientId, patients.id))
            .innerJoin(branches, eq(appointments.branchId, branches.id))
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
            const local = new Date(row.startsAt.getTime() + input.offsetMinutes * 60_000);

            const message = renderTemplate(settings.reminderTemplate, {
                name: row.name,
                clinic: settings.clinicName,
                date: local.toISOString().slice(0, 10),
                time: local.toISOString().slice(11, 16),
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
                whatsappApp: row.whatsappApp,
                message,
                labStatus: row.labStatus,
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
        broadcast(WS_EVENT.REMINDER_UPDATED, { id });
        return row;
    },

    async markSkipped(id: string): Promise<Reminder> {
        const [row] = await db
            .update(reminders)
            .set({ status: 'skipped' })
            .where(eq(reminders.id, id))
            .returning();

        if (!row) throw AppError.notFound('reminder');
        broadcast(WS_EVENT.REMINDER_UPDATED, { id });
        return row;
    },

    async dismissToday(input: DismissTodayInput) {
        return settingsService.dismissRemindersFor(input.date);
    },
};
