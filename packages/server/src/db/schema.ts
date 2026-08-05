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
    text,
    time,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';

/** Every timestamp in the schema is `timestamptz`, read back as a JS `Date`. */
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * SPEC §5. Timestamps are `timestamptz`. Money is integer piastres — never
 * floats. IDs are UUIDv7, generated in application code (`Bun.randomUUIDv7()`)
 * because Postgres 17 has no `uuidv7()`.
 *
 * The `EXCLUDE USING gist` overlap constraint on `appointments` and the
 * `btree_gist` extension it needs are not expressible in Drizzle's schema DSL.
 * They live in a hand-written migration; see `db/migrations/`.
 */

export const branches = pgTable('branches', {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    address: text('address'),
    active: boolean('active').notNull().default(true),
});

export const patients = pgTable(
    'patients',
    {
        id: uuid('id').primaryKey(),
        name: text('name').notNull(),
        /** E.164, normalized on write. */
        phone: text('phone').notNull(),
        email: text('email'),
        /** Age is derived at read time and never stored. */
        birthDate: date('birth_date'),
        gender: text('gender'),
        /** Answers keyed by `custom_questions.key`. */
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
    /** Null means this row is a category root. One level of nesting only (§5). */
    parentId: uuid('parent_id').references((): AnyPgColumn => procedureTypes.id),
    name: text('name').notNull(),
    /** Piastres. */
    defaultPrice: integer('default_price').notNull(),
    hasQuantity: boolean('has_quantity').notNull().default(false),
    isCheckup: boolean('is_checkup').notNull().default(false),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
});

export const appointments = pgTable(
    'appointments',
    {
        id: uuid('id').primaryKey(),
        /** `DDMMYY-XXXX`, day first. Stored uppercase, matched case-insensitively. */
        ref: text('ref').notNull().unique(),
        patientId: uuid('patient_id')
            .notNull()
            .references(() => patients.id),
        branchId: uuid('branch_id')
            .notNull()
            .references(() => branches.id),
        startsAt: timestamptz('starts_at').notNull(),
        /** Chosen by the secretary, never derived from the procedure type (§7). */
        durationMinutes: integer('duration_minutes').notNull(),
        typeId: uuid('type_id').references(() => procedureTypes.id),
        note: text('note'),
        status: text('status', { enum: APPOINTMENT_STATUSES }).notNull().default('booked'),
        channel: text('channel', { enum: APPOINTMENT_CHANNELS }).notNull().default('desk'),
        createdAt: timestamptz('created_at').notNull().defaultNow(),
        updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    },
    (t) => [
        // The day view queries a date range.
        index('appointments_starts_at_idx').on(t.startsAt),
        index('appointments_patient_id_idx').on(t.patientId),
        check('appointments_duration_positive', sql`${t.durationMinutes} > 0`),
    ],
);

export const visits = pgTable('visits', {
    id: uuid('id').primaryKey(),
    /** One appointment has at most one visit (§5). */
    appointmentId: uuid('appointment_id')
        .notNull()
        .unique()
        .references(() => appointments.id),
    checkedInAt: timestamptz('checked_in_at').notNull(),
    /** When `charged_total` was set, if that happened before checkout. */
    pricedAt: timestamptz('priced_at'),
    /** Checked out. */
    completedAt: timestamptz('completed_at'),
    /** Rule output from the entered procedures (§9). Never edited. */
    computedTotal: integer('computed_total').notNull().default(0),
    /** What the patient owes. The difference from computed is the discount. */
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
        /** Piastres, always positive. A visit may have zero, one, or several. */
        amount: integer('amount').notNull(),
        method: text('method', { enum: PAYMENT_METHODS }).notNull(),
        /** Required when `method = 'other'`. */
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
        /** Snapshot of the price on the day. Line total is unit_price × quantity. */
        unitPrice: integer('unit_price').notNull(),
        /** Palmer notation, e.g. `UL6`. Null when the procedure is not tooth-specific (§5). */
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
    /** Stable key into `patients.custom`. */
    key: text('key').notNull().unique(),
    label: text('label').notNull(),
    kind: text('kind', { enum: QUESTION_KINDS }).notNull(),
    /** Only meaningful when `kind = 'select'`. */
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
        /** `starts_at - settings.reminder_lead_hours`, set on booking (§11). */
        dueAt: timestamptz('due_at').notNull(),
        status: text('status', { enum: REMINDER_STATUSES }).notNull().default('pending'),
        sentAt: timestamptz('sent_at'),
    },
    (t) => [index('reminders_status_due_at_idx').on(t.status, t.dueAt)],
);

/** A single enforced row (§5). */
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
        /** §11: the repeat is suppressed while this equals today. */
        reminderDismissedOn: date('reminder_dismissed_on'),
        reminderTemplate: text('reminder_template').notNull(),
        updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    },
    (t) => [check('settings_single_row', sql`${t.id} = 1`)],
);

export const schema = {
    branches,
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
