/**
 * SPEC §5. Timestamps are `timestamptz`. Money is integer piastres — never
 * floats. IDs are UUIDv7, generated in application code (`Bun.randomUUIDv7()`)
 * because Postgres 17 has no `uuidv7()`.
 *
 * The `EXCLUDE USING gist` overlap constraint on `appointments` and the
 * `btree_gist` extension it needs are not expressible in Drizzle's schema DSL.
 * They live in a hand-written migration; see `db/migrations/`.
 *
 * The weekly schedule keys a row by the weekday itself, so the dentist being
 * in two places on the same day is impossible by construction (MAW-1).
 * `visits.appointment_id` is UNIQUE (one appointment has at most one visit),
 * and `settings` is a single enforced row (id = 1).
 */
import {
    APPOINTMENT_CHANNELS,
    APPOINTMENT_STATUSES,
    DEFAULT_DURATION_MINUTES,
    DEFAULT_DURATION_OPTIONS,
    DEFAULT_REMINDER_LEAD_HOURS,
    DEFAULT_REMINDER_NOTIFY_AT,
    DEFAULT_REMINDER_REPEAT_MINUTES,
    PAYMENT_METHODS,
    QUESTION_KINDS,
    REMINDER_STATUSES,
    TEETH,
} from '@mawid/shared';
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
    boolean,
    check,
    date,
    index,
    integer,
    jsonb,
    pgTable,
    smallint,
    text,
    time,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const branches = pgTable('branches', {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    address: text('address'),
    active: boolean('active').notNull().default(true),
});

export const clinicDays = pgTable(
    'clinic_days',
    {
        weekday: smallint('weekday').primaryKey(),
        branchId: uuid('branch_id')
            .notNull()
            .references(() => branches.id),
        opensAt: time('opens_at').notNull(),
        closesAt: time('closes_at').notNull(),
    },
    (t) => [
        check('clinic_days_weekday_range', sql`${t.weekday} BETWEEN 0 AND 6`),
        check('clinic_days_opens_before_closes', sql`${t.opensAt} < ${t.closesAt}`),
    ],
);

export const patients = pgTable(
    'patients',
    {
        id: uuid('id').primaryKey(),
        name: text('name').notNull(),
        phone: text('phone').notNull(),
        email: text('email'),
        birthDate: date('birth_date'),
        gender: text('gender'),
        custom: jsonb('custom').notNull().default(sql`'{}'::jsonb`),
        notes: text('notes'),
        createdAt: timestamptz('created_at').notNull().defaultNow(),
    },
    (t) => [
        index('patients_phone_idx').on(t.phone),
        index('patients_name_idx').using('gin', sql`to_tsvector('simple', ${t.name})`),
    ],
);

export const procedureTypes = pgTable('procedure_types', {
    id: uuid('id').primaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => procedureTypes.id),
    name: text('name').notNull(),
    defaultPrice: integer('default_price').notNull(),
    hasQuantity: boolean('has_quantity').notNull().default(false),
    isToothSpecific: boolean('is_tooth_specific').notNull().default(false),
    isCheckup: boolean('is_checkup').notNull().default(false),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
});

export const appointments = pgTable(
    'appointments',
    {
        id: uuid('id').primaryKey(),
        ref: text('ref').notNull().unique(),
        patientId: uuid('patient_id')
            .notNull()
            .references(() => patients.id),
        branchId: uuid('branch_id')
            .notNull()
            .references(() => branches.id),
        startsAt: timestamptz('starts_at').notNull(),
        durationMinutes: integer('duration_minutes').notNull(),
        typeId: uuid('type_id').references(() => procedureTypes.id),
        note: text('note'),
        status: text('status', { enum: APPOINTMENT_STATUSES }).notNull().default('booked'),
        channel: text('channel', { enum: APPOINTMENT_CHANNELS }).notNull().default('desk'),
        createdAt: timestamptz('created_at').notNull().defaultNow(),
        updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    },
    (t) => [
        index('appointments_starts_at_idx').on(t.startsAt),
        index('appointments_patient_id_idx').on(t.patientId),
        check('appointments_duration_positive', sql`${t.durationMinutes} > 0`),
    ],
);

export const visits = pgTable('visits', {
    id: uuid('id').primaryKey(),
    appointmentId: uuid('appointment_id')
        .notNull()
        .unique()
        .references(() => appointments.id),
    checkedInAt: timestamptz('checked_in_at').notNull(),
    pricedAt: timestamptz('priced_at'),
    completedAt: timestamptz('completed_at'),
    computedTotal: integer('computed_total').notNull().default(0),
    chargedTotal: integer('charged_total').notNull().default(0),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const payments = pgTable(
    'payments',
    {
        id: uuid('id').primaryKey(),
        visitId: uuid('visit_id')
            .notNull()
            .references(() => visits.id),
        amount: integer('amount').notNull(),
        method: text('method', { enum: PAYMENT_METHODS }).notNull(),
        methodNote: text('method_note'),
        paidAt: timestamptz('paid_at').notNull().defaultNow(),
    },
    (t) => [
        index('payments_visit_id_idx').on(t.visitId),
        check('payments_amount_positive', sql`${t.amount} > 0`),
        check(
            'payments_other_requires_note',
            sql`${t.method} <> 'other' OR (${t.methodNote} IS NOT NULL AND ${t.methodNote} <> '')`,
        ),
    ],
);

export const visitProcedures = pgTable(
    'visit_procedures',
    {
        id: uuid('id').primaryKey(),
        visitId: uuid('visit_id')
            .notNull()
            .references(() => visits.id, { onDelete: 'cascade' }),
        procedureId: uuid('procedure_id')
            .notNull()
            .references(() => procedureTypes.id),
        quantity: integer('quantity').notNull().default(1),
        unitPrice: integer('unit_price').notNull(),
        tooth: text('tooth', { enum: TEETH }),
        note: text('note'),
    },
    (t) => [
        index('visit_procedures_visit_id_idx').on(t.visitId),
        check('visit_procedures_quantity_positive', sql`${t.quantity} > 0`),
    ],
);

export const customQuestions = pgTable('custom_questions', {
    id: uuid('id').primaryKey(),
    key: text('key').notNull().unique(),
    label: text('label').notNull(),
    kind: text('kind', { enum: QUESTION_KINDS }).notNull(),
    options: jsonb('options'),
    required: boolean('required').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
});

export const reminders = pgTable(
    'reminders',
    {
        id: uuid('id').primaryKey(),
        appointmentId: uuid('appointment_id')
            .notNull()
            .unique()
            .references(() => appointments.id),
        dueAt: timestamptz('due_at').notNull(),
        status: text('status', { enum: REMINDER_STATUSES }).notNull().default('pending'),
        sentAt: timestamptz('sent_at'),
    },
    (t) => [index('reminders_status_due_at_idx').on(t.status, t.dueAt)],
);

export const settings = pgTable(
    'settings',
    {
        id: integer('id').primaryKey().default(1),
        clinicName: text('clinic_name').notNull(),
        clinicPhone: text('clinic_phone'),
        durationOptions: integer('duration_options')
            .array()
            .notNull()
            .default([...DEFAULT_DURATION_OPTIONS]),
        defaultDuration: integer('default_duration').notNull().default(DEFAULT_DURATION_MINUTES),
        reminderLeadHours: integer('reminder_lead_hours').notNull().default(DEFAULT_REMINDER_LEAD_HOURS),
        reminderNotifyAt: time('reminder_notify_at').notNull().default(DEFAULT_REMINDER_NOTIFY_AT),
        reminderRepeatMinutes: integer('reminder_repeat_minutes')
            .notNull()
            .default(DEFAULT_REMINDER_REPEAT_MINUTES),
        reminderDismissedOn: date('reminder_dismissed_on'),
        reminderTemplate: text('reminder_template').notNull(),
        updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    },
    (t) => [check('settings_single_row', sql`${t.id} = 1`)],
);

export const schema = {
    branches,
    clinicDays,
    patients,
    procedureTypes,
    appointments,
    visits,
    payments,
    visitProcedures,
    customQuestions,
    reminders,
    settings,
};
