import type { IsoDate, RemindersResponse } from '@mawid/shared';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { getConfig } from '../../config/index.ts';
import { getDb, schema } from '../../db/index.ts';
import { clinicDayBounds } from '../../util/time.ts';

/**
 * One row per appointment that day, in time order.
 *
 * This feeds "these patients were not reminded" — the manual fallback, which is
 * the recovery path for every skip, so it has to be visible (spec §9). It
 * carries the patient and the appointment time because the secretary reads a
 * name, a number and a time off it and picks up the handset.
 */
export function listRemindersForDay(date: IsoDate): RemindersResponse {
    const { start, end } = clinicDayBounds(date, getConfig().clinic.timezone);

    return getDb()
        .select({ reminder: schema.reminders, appointment: schema.appointments, patient: schema.patients })
        .from(schema.reminders)
        .innerJoin(schema.appointments, eq(schema.reminders.appointmentId, schema.appointments.id))
        .innerJoin(schema.patients, eq(schema.appointments.patientId, schema.patients.id))
        .where(
            and(
                gte(schema.appointments.startsAt, start.toISOString()),
                lt(schema.appointments.startsAt, end.toISOString()),
            ),
        )
        .orderBy(asc(schema.appointments.startsAt))
        .all()
        .map(({ reminder, appointment, patient }) => ({
            id: reminder.id,
            appointmentId: reminder.appointmentId,
            status: reminder.status,
            scheduledFor: reminder.scheduledFor,
            sentAt: reminder.sentAt,
            error: reminder.error,
            skipReason: reminder.skipReason,
            attempts: reminder.attempts,
            appointmentStartsAt: appointment.startsAt,
            patient: { id: patient.id, name: patient.name, phone: patient.phone },
        }));
}
