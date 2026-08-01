import type { Appointment, AppointmentWithPatient, Patient, PatientSummary } from '@mawid/shared';
import type { AppointmentRow, PatientRow } from './schema.ts';

/**
 * Database rows → the contract shapes in `@mawid/shared`. Kept out of the two
 * services because both need both: an appointment carries its patient, and a
 * patient carries its appointments. One home for the mapping also means a
 * column that must never leave the server — `patients.notes` in a list — is
 * dropped in exactly one place.
 */

export function toPatient(row: PatientRow): Patient {
    return {
        id: row.id,
        name: row.name,
        phone: row.phone,
        notes: row.notes,
        createdAt: row.createdAt,
    };
}

/** Notes are deliberately absent — see `PatientSummary` in the contract. */
export function toPatientSummary(row: Pick<PatientRow, 'id' | 'name' | 'phone'>): PatientSummary {
    return { id: row.id, name: row.name, phone: row.phone };
}

export function toAppointment(row: AppointmentRow): Appointment {
    return {
        id: row.id,
        ref: row.ref,
        patientId: row.patientId,
        startsAt: row.startsAt,
        durationMin: row.durationMin,
        typeId: row.typeId,
        note: row.note,
        status: row.status,
        channel: row.channel,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export function toAppointmentWithPatient(
    row: AppointmentRow,
    patient: Pick<PatientRow, 'id' | 'name' | 'phone'>,
): AppointmentWithPatient {
    return { ...toAppointment(row), patient: toPatientSummary(patient) };
}
