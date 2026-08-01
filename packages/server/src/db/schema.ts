import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Times are stored as UTC ISO-8601 strings, never as local time — DST and
 * timezone bugs in a booking system are miserable to debug. Convert to clinic
 * time only for display and scheduling. See spec §5.
 */

export const APPOINTMENT_STATUS = ['booked', 'done', 'cancelled', 'no_show'] as const;
export const APPOINTMENT_CHANNEL = ['desk', 'whatsapp', 'phone'] as const;
export const REMINDER_STATUS = ['pending', 'sent', 'failed', 'skipped'] as const;

export const patients = sqliteTable(
    'patients',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        name: text('name').notNull(),
        /** E.164, normalized on write: +20... */
        phone: text('phone').notNull(),
        notes: text('notes'),
        createdAt: text('created_at').notNull(),
    },
    (t) => [index('idx_patients_phone').on(t.phone), index('idx_patients_name').on(t.name)],
);

export const appointments = sqliteTable(
    'appointments',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        /** Short human code, e.g. "M7K2Q" — printed on the slip and used by /s/:ref. */
        ref: text('ref').notNull().unique(),
        patientId: integer('patient_id')
            .notNull()
            .references(() => patients.id),
        /** UTC ISO. */
        startsAt: text('starts_at').notNull(),
        durationMin: integer('duration_min').notNull(),
        /** Matches config.appointmentTypes[].id. */
        typeId: text('type_id').notNull(),
        note: text('note'),
        status: text('status', { enum: APPOINTMENT_STATUS }).notNull().default('booked'),
        channel: text('channel', { enum: APPOINTMENT_CHANNEL }).notNull().default('desk'),
        createdAt: text('created_at').notNull(),
        updatedAt: text('updated_at').notNull(),
    },
    (t) => [index('idx_appt_starts').on(t.startsAt), index('idx_appt_patient').on(t.patientId)],
);

export const reminders = sqliteTable(
    'reminders',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        /**
         * UNIQUE is the guarantee a patient is never messaged twice for the same
         * appointment. Rely on the constraint, not on application logic — see spec §5.
         */
        appointmentId: integer('appointment_id')
            .notNull()
            .references(() => appointments.id),
        status: text('status', { enum: REMINDER_STATUS }).notNull(),
        /** UTC ISO. */
        scheduledFor: text('scheduled_for').notNull(),
        sentAt: text('sent_at'),
        error: text('error'),
        attempts: integer('attempts').notNull().default(0),
    },
    (t) => [
        uniqueIndex('idx_rem_appointment').on(t.appointmentId),
        index('idx_rem_status').on(t.status, t.scheduledFor),
    ],
);

export const patientRelations = relations(patients, ({ many }) => ({
    appointments: many(appointments),
}));

export const appointmentRelations = relations(appointments, ({ one }) => ({
    patient: one(patients, { fields: [appointments.patientId], references: [patients.id] }),
    reminder: one(reminders),
}));

export const reminderRelations = relations(reminders, ({ one }) => ({
    appointment: one(appointments, {
        fields: [reminders.appointmentId],
        references: [appointments.id],
    }),
}));

export type PatientRow = typeof patients.$inferSelect;
export type NewPatientRow = typeof patients.$inferInsert;
export type AppointmentRow = typeof appointments.$inferSelect;
export type NewAppointmentRow = typeof appointments.$inferInsert;
export type ReminderRow = typeof reminders.$inferSelect;
export type NewReminderRow = typeof reminders.$inferInsert;

export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[number];
export type AppointmentChannel = (typeof APPOINTMENT_CHANNEL)[number];
export type ReminderStatus = (typeof REMINDER_STATUS)[number];

/**
 * The half-open interval `[starts_at, starts_at + duration_min)` of an
 * appointment, as a raw SQL expression. The overlap check in
 * `appointment.service.ts` is written by hand against these rather than composed
 * through the query builder — it is the one hard correctness guarantee in the
 * system and it must be obviously correct on reading. See spec §5.
 */
export const apptEndsAt = sql`datetime(${appointments.startsAt}, '+' || ${appointments.durationMin} || ' minutes')`;
