import { z } from 'zod';
import { newPatientSchema, type PatientSummary } from './patient.ts';
import { type IsoDate, type IsoInstant, isoInstantSchema } from './time.ts';

export const APPOINTMENT_STATUSES = ['booked', 'done', 'cancelled', 'no_show'] as const;
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_CHANNELS = ['desk', 'whatsapp', 'phone'] as const;
export const appointmentChannelSchema = z.enum(APPOINTMENT_CHANNELS);
export type AppointmentChannel = (typeof APPOINTMENT_CHANNELS)[number];

/**
 * The short code printed on the slip and encoded in its QR, e.g. `020826-03` —
 * the third appointment on 2 Aug 2026. `DDMMYY-NN`, day first.
 *
 * The date alone cannot be the ref: it is `UNIQUE` and the clinic books many
 * appointments a day, so `NN` is a per-day sequence. Uniqueness is the db's job
 * — insert, and on conflict take the next number; two bookings taken at once
 * will otherwise race to the same count.
 *
 * The date is the **appointment's** clinic-local day, not the day it was booked,
 * so the code on the paper the patient is holding says when to come. The ref is
 * assigned once and never changes: rescheduling leaves it pointing at the old
 * day, which is why moving an appointment means reprinting the slip.
 */
export const appointmentRefSchema = z
    .string()
    .trim()
    .regex(/^\d{6}-\d{2,3}$/, 'expected a ref code as DDMMYY-NN');

export const refParamSchema = z.object({
    ref: appointmentRefSchema,
});

/**
 * Builds a ref from the appointment's **clinic-local** day — pass the day from
 * `toClinicClock(startsAt, timezone).date`, never `startsAt.slice(0, 10)`, or a
 * 21:00 Cairo booking gets tomorrow's date on its slip.
 *
 * Lives here so the format is written down once, next to the regex that guards
 * it. `sequence` is 1-based, per day.
 */
export function formatAppointmentRef(clinicDate: IsoDate, sequence: number): string {
    // Fixed offsets into `YYYY-MM-DD`, which `isoDateSchema` guarantees.
    const shortDate = clinicDate.slice(8, 10) + clinicDate.slice(5, 7) + clinicDate.slice(2, 4);
    return `${shortDate}-${String(sequence).padStart(2, '0')}`;
}

export interface Appointment {
    id: number;
    /** `DDMMYY-NN`, e.g. `020826-03`. See `appointmentRefSchema`. */
    ref: string;
    patientId: number;
    /** UTC ISO. */
    startsAt: IsoInstant;
    /** Resolved from the appointment type at booking time, then frozen — an
     *  edit to `config.appointmentTypes` must not silently move old bookings. */
    durationMin: number;
    /** Matches `PublicConfig.appointmentTypes[].id`. Localize the label there. */
    typeId: string;
    note: string | null;
    status: AppointmentStatus;
    channel: AppointmentChannel;
    createdAt: IsoInstant;
    updatedAt: IsoInstant;
}

/**
 * The shape every appointment endpoint returns *except* the patient page's
 * history, where the patient is already the subject.
 *
 * The patient is embedded rather than referenced by id: the desk day view would
 * otherwise fire one request per row, and a `scan` event — which carries bare
 * ids — would need two round trips before it could show a name.
 */
export interface AppointmentWithPatient extends Appointment {
    patient: PatientSummary;
}

/**
 * `GET /api/appointments?date=` → `AppointmentWithPatient[]`, in time order.
 *
 * Cancelled appointments are included; every row carries its `status` and the
 * desk decides how to show it. (The *printed* day schedule excludes them, but
 * that render happens server-side.)
 */
export type DayAppointments = AppointmentWithPatient[];

/**
 * `POST /api/appointments` → `AppointmentWithPatient`
 *
 * Two ways in, because booking a walk-in must not be two screens: either an
 * existing `patientId` from the picker, or an inline `patient` the server
 * creates in the same transaction as the appointment.
 *
 * No `durationMin` — it comes from `typeId` via config, so the desk cannot
 * disagree with the clinic's own configuration.
 */
const bookingFields = {
    startsAt: isoInstantSchema,
    typeId: z.string().min(1),
    note: z.string().trim().max(500).optional(),
    channel: appointmentChannelSchema.default('desk'),
};

export const createAppointmentSchema = z.union(
    [
        z.object({ patientId: z.number().int().positive(), ...bookingFields }),
        z.object({ patient: newPatientSchema, ...bookingFields }),
    ],
    { error: 'expected either `patientId` or an inline `patient` of { name, phone }' },
);

/** `z.input`, not `z.infer`: `channel` has a default, so the desk may omit it. */
export type CreateAppointmentBody = z.input<typeof createAppointmentSchema>;

/**
 * `PATCH /api/appointments/:id` → `AppointmentWithPatient`
 *
 * Moving an appointment (`startsAt` or `typeId`) re-runs the overlap check and
 * can fail with `SLOT_TAKEN` exactly as booking does.
 */
export const updateAppointmentSchema = z
    .object({
        startsAt: isoInstantSchema.optional(),
        typeId: z.string().min(1).optional(),
        status: appointmentStatusSchema.optional(),
        note: z.string().trim().max(500).nullable().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, { message: 'expected at least one field' });

export type UpdateAppointmentBody = z.infer<typeof updateAppointmentSchema>;
