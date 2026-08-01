import { z } from 'zod';
import { newPatientSchema, type PatientSummary } from './patient.ts';
import { type IsoInstant, isoInstantSchema } from './time.ts';

export const APPOINTMENT_STATUSES = ['booked', 'done', 'cancelled', 'no_show'] as const;
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_CHANNELS = ['desk', 'whatsapp', 'phone'] as const;
export const appointmentChannelSchema = z.enum(APPOINTMENT_CHANNELS);
export type AppointmentChannel = (typeof APPOINTMENT_CHANNELS)[number];

/**
 * The short code printed on the slip and encoded in its QR, e.g. `M7K2Q`. It is
 * what `/s/:ref` resolves, so it is read off paper by a human or a camera —
 * uppercase and short on purpose.
 */
export const appointmentRefSchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,8}$/, 'expected a short alphanumeric ref code');

export const refParamSchema = z.object({
    ref: appointmentRefSchema,
});

export interface Appointment {
    id: number;
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
