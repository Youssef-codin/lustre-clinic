import {
    type Appointment,
    type AppointmentWithPatient,
    appointmentTypeLabel,
    formatAppointmentRef,
    type IsoDate,
    type IsoInstant,
    type NewPatient,
    type OpenSlot,
    type Patient,
    type PatientSummary,
    type PublicConfig,
    type SlotsResponse,
} from '@mawid/shared';
import { addDays, clinicDay, clinicTimeToInstant, todayInClinic, weekdayOf } from '../lib/datetime.ts';

/**
 * In-memory stand-in for the server's database. Every value here is sample
 * data, not a clinic's — the real settings come from `config.json` (spec §15).
 * Delete `src/mocks/` once the appointment and patient modules exist.
 */

/** Mirrors `config.example.json`, used only when `/api/config` is unreachable. */
export const FALLBACK_CONFIG: PublicConfig = {
    clinic: {
        name: 'عيادة الأسنان',
        nameEn: 'Dental Clinic',
        phone: '+201000000000',
        address: '١٢ شارع المثال، القاهرة',
        addressEn: '12 Example St, Cairo',
        timezone: 'Africa/Cairo',
    },
    hours: {
        '0': [{ from: '10:00', to: '14:00' }],
        '1': [
            { from: '10:00', to: '14:00' },
            { from: '17:00', to: '21:00' },
        ],
        '2': [{ from: '10:00', to: '14:00' }],
        '3': [
            { from: '10:00', to: '14:00' },
            { from: '17:00', to: '21:00' },
        ],
        '4': [{ from: '10:00', to: '14:00' }],
        '6': [{ from: '17:00', to: '21:00' }],
    },
    appointmentTypes: [
        { id: 'checkup', label: 'كشف', labelEn: 'Check-up', minutes: 20 },
        { id: 'cleaning', label: 'تنظيف', labelEn: 'Cleaning', minutes: 30 },
        { id: 'filling', label: 'حشو', labelEn: 'Filling', minutes: 45 },
        { id: 'extraction', label: 'خلع', labelEn: 'Extraction', minutes: 45 },
        { id: 'rootcanal', label: 'علاج عصب', labelEn: 'Root canal', minutes: 90 },
        { id: 'other', label: 'أخرى', labelEn: 'Other', minutes: 30 },
    ],
    defaultLocale: 'ar',
};

/** What the server does on write — the desk form is never asked to. */
export function normalizePhone(raw: string): string {
    const digits = raw.replace(/[\s-]/g, '');
    if (digits.startsWith('+')) return digits;
    if (digits.startsWith('0')) return `+20${digits.slice(1)}`;
    return `+20${digits}`;
}

export function summarize(patient: Patient): PatientSummary {
    return { id: patient.id, name: patient.name, phone: patient.phone };
}

export class MockStore {
    readonly config: PublicConfig;
    private patients: Patient[] = [];
    private appointments: Appointment[] = [];
    private nextPatientId = 1;
    private nextAppointmentId = 1;

    constructor(config: PublicConfig) {
        this.config = config;
        this.seed();
    }

    private durationOf(typeId: string): number | null {
        return this.config.appointmentTypes.find((type) => type.id === typeId)?.minutes ?? null;
    }

    private seed(): void {
        const timezone = this.config.clinic.timezone;
        const today = todayInClinic(timezone);

        const people: Array<NewPatient & { notes?: string }> = [
            { name: 'أحمد صلاح', phone: '01012345678' },
            { name: 'منى عادل', phone: '01098765432', notes: 'حساسية من البنسلين' },
            { name: 'سارة نبيل', phone: '01001112222' },
            { name: 'عمر هاني', phone: '01234567890' },
            { name: 'ليلى مصطفى', phone: '01155667788' },
        ];
        for (const person of people) {
            this.createPatient(person.name, person.phone, person.notes ?? null);
        }

        /*
         * Sample bookings are placed as offsets from whatever time the clinic
         * actually opens that day, not at fixed clock times. The hours differ
         * per weekday, so a hardcoded 10:00 lands outside working hours on a
         * day that only opens at 17:00 — which then shows a day view no set of
         * open slots could ever have produced.
         */
        const plan: Array<{ date: IsoDate; offsetMin: number; patientId: number; typeId: string }> = [
            { date: today, offsetMin: 0, patientId: 1, typeId: 'checkup' },
            { date: today, offsetMin: 40, patientId: 2, typeId: 'filling' },
            { date: today, offsetMin: 105, patientId: 3, typeId: 'extraction' },
            { date: addDays(today, 1), offsetMin: 20, patientId: 4, typeId: 'rootcanal' },
            { date: addDays(today, 1), offsetMin: 140, patientId: 5, typeId: 'cleaning' },
        ];

        for (const booking of plan) {
            const range = this.config.hours[weekdayOf(booking.date)]?.[0];
            if (!range) continue; // closed that day

            const opens = new Date(clinicTimeToInstant(booking.date, range.from, timezone)).getTime();
            const closes = new Date(clinicTimeToInstant(booking.date, range.to, timezone)).getTime();
            const startsAt = new Date(opens + booking.offsetMin * 60_000).toISOString();
            const durationMin = this.durationOf(booking.typeId) ?? 0;

            if (opens + (booking.offsetMin + durationMin) * 60_000 > closes) continue;
            this.createAppointment(booking.patientId, startsAt, booking.typeId, null, 'desk');
        }

        // One cancelled row, so the day view is built against a status it must show.
        const cancelled = this.appointments.find((appointment) => appointment.patientId === 3);
        if (cancelled) cancelled.status = 'cancelled';
    }

    createPatient(name: string, phone: string, notes: string | null): Patient {
        const patient: Patient = {
            id: this.nextPatientId++,
            name: name.trim(),
            phone: normalizePhone(phone),
            notes,
            createdAt: new Date().toISOString(),
        };
        this.patients.push(patient);
        return patient;
    }

    findPatient(id: number): Patient | undefined {
        return this.patients.find((patient) => patient.id === id);
    }

    searchPatients(query: string, limit: number): PatientSummary[] {
        const needle = query.trim().toLowerCase();
        const digits = needle.replace(/[\s-+]/g, '');

        return this.patients
            .filter((patient) => {
                if (patient.name.toLowerCase().includes(needle)) return true;
                return digits.length > 0 && patient.phone.includes(digits);
            })
            .slice(0, limit)
            .map(summarize);
    }

    /** Throws the string `SLOT_TAKEN` — the caller maps it to the envelope. */
    createAppointment(
        patientId: number,
        startsAt: IsoInstant,
        typeId: string,
        note: string | null,
        channel: Appointment['channel'],
    ): Appointment {
        const durationMin = this.durationOf(typeId);
        if (durationMin === null) throw new Error('BAD_REQUEST');
        if (!this.findPatient(patientId)) throw new Error('PATIENT_NOT_FOUND');
        if (this.overlaps(startsAt, durationMin, null)) throw new Error('SLOT_TAKEN');

        /*
         * `DDMMYY-NN` off the appointment's *clinic-local* day, so the code on
         * the paper the patient is holding says when to come. Real uniqueness is
         * the db's job (insert, on conflict take the next number); counting rows
         * is only safe here because a mock has no concurrent writers.
         */
        const clinicDate = clinicDay(startsAt, this.config.clinic.timezone);
        const sameDay = this.appointments.filter(
            (other) => clinicDay(other.startsAt, this.config.clinic.timezone) === clinicDate,
        ).length;

        const now = new Date().toISOString();
        const appointment: Appointment = {
            id: this.nextAppointmentId++,
            ref: formatAppointmentRef(clinicDate, sameDay + 1),
            patientId,
            startsAt,
            durationMin,
            typeId,
            note,
            status: 'booked',
            channel,
            createdAt: now,
            updatedAt: now,
        };
        this.appointments.push(appointment);
        return appointment;
    }

    /** The one hard correctness guarantee (spec §5) — mirrored here so the desk
     *  form is developed against a server that actually rejects a double booking. */
    private overlaps(startsAt: IsoInstant, durationMin: number, ignoreId: number | null): boolean {
        const start = new Date(startsAt).getTime();
        const end = start + durationMin * 60_000;

        return this.appointments.some((other) => {
            if (other.status !== 'booked' || other.id === ignoreId) return false;
            const otherStart = new Date(other.startsAt).getTime();
            const otherEnd = otherStart + other.durationMin * 60_000;
            return start < otherEnd && otherStart < end;
        });
    }

    withPatient(appointment: Appointment): AppointmentWithPatient {
        const patient = this.findPatient(appointment.patientId);
        if (!patient) throw new Error('PATIENT_NOT_FOUND');
        return { ...appointment, patient: summarize(patient) };
    }

    findAppointment(id: number): Appointment | undefined {
        return this.appointments.find((appointment) => appointment.id === id);
    }

    appointmentsOn(date: IsoDate): AppointmentWithPatient[] {
        const timezone = this.config.clinic.timezone;
        return this.appointments
            .filter((appointment) => clinicDay(appointment.startsAt, timezone) === date)
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
            .map((appointment) => this.withPatient(appointment));
    }

    historyFor(patientId: number): Appointment[] {
        return this.appointments
            .filter((appointment) => appointment.patientId === patientId)
            .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    }

    /** Walks each working-hours range in `durationMin` steps, dropping anything
     *  that collides with a booked appointment. */
    slotsOn(date: IsoDate, typeId: string): SlotsResponse | null {
        const durationMin = this.durationOf(typeId);
        if (durationMin === null) return null;

        const timezone = this.config.clinic.timezone;
        const ranges = this.config.hours[weekdayOf(date)] ?? [];
        const slots: OpenSlot[] = [];

        for (const range of ranges) {
            const closes = new Date(clinicTimeToInstant(date, range.to, timezone)).getTime();
            let cursor = new Date(clinicTimeToInstant(date, range.from, timezone)).getTime();

            while (cursor + durationMin * 60_000 <= closes) {
                const startsAt = new Date(cursor).toISOString();
                if (!this.overlaps(startsAt, durationMin, null)) slots.push({ startsAt });
                cursor += durationMin * 60_000;
            }
        }

        return { date, typeId, durationMin, slots };
    }

    /** Only used by the mock's own logging, but it keeps the label lookup honest. */
    labelFor(typeId: string): string {
        const type = this.config.appointmentTypes.find((candidate) => candidate.id === typeId);
        return type ? appointmentTypeLabel(type, 'en') : typeId;
    }
}
