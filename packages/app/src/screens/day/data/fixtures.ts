import {
    DEFAULT_REMINDER_LEAD_HOURS,
    ERROR_CODE,
    PAYMENT_METHODS,
    type PaymentMethod,
    SLOT_HOLDING_STATUSES,
} from '@mawid/shared';
import { addDays, clock12, dateKey, isoAt, minutesOfDay, todayKey } from '../time';
import { RequestError, type Transport } from './client';
import type { Appointment, ClinicDay, PendingReminder, ProcedureType, Visit, VisitRow } from './types';

/**
 * The in-memory clinic — BLOCKED.md.
 *
 * Onboarding (F1) is what configures a server address, and it has not landed,
 * so without one there is nothing to talk to and the screen would be a
 * permanent error state. This stands in: enough of a clinic to drive every
 * state the day view has, on a device, with no Postgres.
 *
 * It enforces the overlap constraint because that is the one behaviour that
 * must not be discovered late. Double-booking is an `EXCLUDE USING gist` in
 * Postgres (§5), and the client's job is to turn `SLOT_OVERLAP` into a sentence
 * the secretary can act on — which is only testable if something rejects.
 */

const BRANCH_ID = '0192f3a0-0000-7000-8000-00000000b1a1';
const BRANCH_ID_2 = '0192f3a0-0000-7000-8000-00000000b1a2';

let sequence = 0;
function id(prefix: string): string {
    sequence += 1;
    return `0192f3a0-0000-7000-8000-${prefix}${String(sequence).padStart(8, '0')}`;
}

interface StoredPatient {
    id: string;
    name: string;
    phone: string;
}

const patients: StoredPatient[] = [
    { id: id('aaaa'), name: 'Nadia Sherif', phone: '+201001234567' },
    { id: id('aaaa'), name: 'Omar Fathy', phone: '+201112223334' },
    { id: id('aaaa'), name: 'مريم عبد الله', phone: '+201223334445' },
    { id: id('aaaa'), name: 'Youssef Kamal', phone: '+201555667788' },
    { id: id('aaaa'), name: 'Hana Mostafa', phone: '+201099887766' },
];

const appointments: Appointment[] = [];
const visits: Visit[] = [];

/** `procedure.list` — what the day rows name, and what a walk-in defaults to. */
const procedureTypes: ProcedureType[] = [
    { id: id('9999'), name: 'Check-up', defaultPrice: 30_000 },
    { id: id('9999'), name: 'Cleaning', defaultPrice: 60_000 },
    { id: id('9999'), name: 'Composite filling', defaultPrice: 90_000 },
    { id: id('9999'), name: 'Root canal', defaultPrice: 240_000 },
    { id: id('9999'), name: 'Crown fitting', defaultPrice: 350_000 },
    { id: id('9999'), name: 'Extraction', defaultPrice: 110_000 },
];

function procedureId(index: number): string | null {
    return procedureTypes[index % procedureTypes.length]?.id ?? null;
}

function seedAppointment(
    dayKey: string,
    minutes: number,
    durationMinutes: number,
    patientIndex: number,
    status: Appointment['status'],
    channel: Appointment['channel'] = 'desk',
    typeIndex: number | null = null,
    branchId: string = BRANCH_ID,
): Appointment {
    const patient = patients[patientIndex % patients.length];
    if (!patient) throw new Error('fixture patient missing');

    const appointment: Appointment = {
        id: id('bbbb'),
        ref: `${dayKey.slice(8, 10)}${dayKey.slice(5, 7)}${dayKey.slice(2, 4)}-${String(sequence).padStart(4, '0').slice(-4).toUpperCase()}`,
        patientId: patient.id,
        branchId,
        startsAt: isoAt(dayKey, minutes),
        durationMinutes,
        typeId: typeIndex === null ? null : procedureId(typeIndex),
        note: null,
        status,
        channel,
        createdAt: isoAt(dayKey, 0),
        updatedAt: isoAt(dayKey, 0),
        patient,
    };
    appointments.push(appointment);
    return appointment;
}

function seedVisit(appointmentId: string, chargedTotal: number, paid: number): Visit {
    const visit: Visit = {
        id: id('cccc'),
        appointmentId,
        checkedInAt: new Date().toISOString(),
        pricedAt: null,
        completedAt: paid > 0 ? new Date().toISOString() : null,
        computedTotal: chargedTotal,
        chargedTotal,
        createdAt: new Date().toISOString(),
        procedures: [
            {
                id: id('dddd'),
                procedureId: id('eeee'),
                name: 'Check-up',
                quantity: 1,
                unitPrice: 30_000,
                isCheckup: true,
                tooth: null,
                note: null,
                lineTotal: 30_000,
            },
        ],
        payments: [],
        paidTotal: paid,
        balance: chargedTotal - paid,
    };
    visits.push(visit);
    return visit;
}

const today = todayKey();

seedAppointment(today, 10 * 60, 30, 0, 'done', 'desk', 1);
const inChair = seedAppointment(today, 11 * 60, 45, 1, 'checked_in', 'desk', 2);
seedVisit(inChair.id, 30_000, 0);
seedAppointment(today, 12 * 60 + 30, 30, 2, 'booked', 'desk', 0);
seedAppointment(today, 14 * 60, 20, 3, 'no_show', 'desk', 5);
seedAppointment(today, 17 * 60, 45, 4, 'booked', 'desk', 4);
seedAppointment(today, 18 * 60, 30, 1, 'cancelled', 'desk', 3);
const tomorrow = [
    seedAppointment(addDays(today, 1), 11 * 60, 30, 2, 'booked', 'desk', 1),
    seedAppointment(addDays(today, 1), 15 * 60, 45, 0, 'booked', 'desk', 4),
];
const dayAfter = seedAppointment(addDays(today, 2), 13 * 60, 30, 4, 'booked', 'desk', 0);

seedAppointment(today, 13 * 60 + 30, 30, 3, 'booked', 'desk', 1, BRANCH_ID_2);
seedAppointment(today, 16 * 60, 45, 0, 'booked', 'desk', 5, BRANCH_ID_2);

/**
 * §11 — a reminder row exists from the moment an appointment is booked, and
 * falls due `reminder_lead_hours` before it. The seeded ones are due now, which
 * is the only state the screen has anything to draw: tomorrow's list, waiting
 * to be sent.
 */
interface StoredReminder extends PendingReminder {
    status: 'pending' | 'sent' | 'skipped';
}

const reminders: StoredReminder[] = [...tomorrow, dayAfter].map((appointment) => {
    const local = new Date(appointment.startsAt);
    const { time, meridiem } = clock12(minutesOfDay(appointment.startsAt));
    const message =
        `Hello ${appointment.patient.name}, this is a reminder of your appointment at ` +
        `Nile Dental on ${dateKey(local)} at ${time} ${meridiem}.`;

    return {
        id: id('7777'),
        appointmentId: appointment.id,
        dueAt: new Date(local.getTime() - DEFAULT_REMINDER_LEAD_HOURS * 3_600_000).toISOString(),
        startsAt: appointment.startsAt,
        ref: appointment.ref,
        patient: appointment.patient,
        // `toWhatsAppNumber` is the server's; the fixture phones are already in
        // the form it produces, less the leading plus.
        whatsAppUrl: `https://wa.me/${appointment.patient.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`,
        message,
        status: 'pending',
    };
});

const schedule: ClinicDay[] = [0, 1, 2, 3, 4, 6].map((weekday) => ({
    weekday,
    branchId: BRANCH_ID,
    opensAt: '10:00',
    closesAt: '22:00',
}));

/** §5 — the constraint Postgres enforces, so the client can be built against it. */
function assertFree(startsAt: string, durationMinutes: number, ignoreId?: string): void {
    const start = new Date(startsAt).getTime();
    const end = start + durationMinutes * 60_000;

    const clash = appointments.some((row) => {
        if (row.id === ignoreId) return false;
        if (!(SLOT_HOLDING_STATUSES as readonly string[]).includes(row.status)) return false;
        const rowStart = new Date(row.startsAt).getTime();
        return rowStart < end && start < rowStart + row.durationMinutes * 60_000;
    });

    if (clash) {
        throw new RequestError(ERROR_CODE.SLOT_OVERLAP, 'that slot overlaps another appointment');
    }
}

function requireAppointment(appointmentId: string): Appointment {
    const row = appointments.find((a) => a.id === appointmentId);
    if (!row) throw new RequestError(ERROR_CODE.NOT_FOUND, 'appointment not found');
    return row;
}

function toRow(visit: Visit): VisitRow {
    return {
        id: visit.id,
        appointmentId: visit.appointmentId,
        checkedInAt: visit.checkedInAt,
        computedTotal: visit.computedTotal,
        chargedTotal: visit.chargedTotal,
    };
}

function field(input: unknown, name: string): unknown {
    if (typeof input !== 'object' || input === null) return undefined;
    return (input as Record<string, unknown>)[name];
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
    return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

function stringField(input: unknown, name: string): string {
    const value = field(input, name);
    if (typeof value !== 'string') throw new RequestError(ERROR_CODE.VALIDATION, `${name} is required`);
    return value;
}

/** The clinic PC is a hop away over Tailscale. An instant answer hides that. */
const LATENCY_MS = 400;

function delay<T>(value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function call(path: string, input: unknown): Promise<unknown> {
    switch (path) {
        case 'settings.schedule':
            return delay(schedule);

        case 'settings.get':
            return delay({
                clinicName: 'Nile Dental',
                durationOptions: [10, 20, 30, 45],
                defaultDuration: 30,
            });

        case 'procedure.list':
            return delay(procedureTypes);

        case 'reminder.pending': {
            const dueOnly = field(input, 'dueOnly') !== false;
            const now = Date.now();
            return delay(
                reminders
                    .filter((row) => row.status === 'pending')
                    .filter((row) => !dueOnly || new Date(row.dueAt).getTime() <= now)
                    .filter((row) => {
                        // The server joins `appointments` and takes booked rows
                        // only — a cancelled appointment owes no message.
                        const appointment = appointments.find((a) => a.id === row.appointmentId);
                        return appointment?.status === 'booked';
                    })
                    .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
            );
        }

        case 'reminder.markSent':
        case 'reminder.markSkipped': {
            const reminderId = stringField(input, 'id');
            const row = reminders.find((r) => r.id === reminderId);
            if (!row) throw new RequestError(ERROR_CODE.NOT_FOUND, 'reminder not found');
            row.status = path === 'reminder.markSent' ? 'sent' : 'skipped';
            return delay(row);
        }

        // §11 — this silences the repeating notification for the rest of the
        // day. It does not touch the rows; "Skip all" is `markSkipped` over
        // each of them, and the two must not be confused.
        case 'reminder.dismissToday':
            return delay({ remindersDismissedOn: stringField(input, 'date') });

        case 'branch.list':
            return delay([
                { id: BRANCH_ID, name: 'Maadi', address: null, active: true },
                { id: BRANCH_ID_2, name: 'Nasr City', address: null, active: true },
            ]);

        case 'patient.search': {
            const term = String(field(input, 'q') ?? '').toLowerCase();
            if (!term) return delay([]);
            return delay(
                patients.filter(
                    (p) => p.name.toLowerCase().includes(term) || p.phone.includes(term.replace(/^0/, '')),
                ),
            );
        }

        case 'appointment.byDate': {
            const key = stringField(input, 'date');
            const branchId = field(input, 'branchId');
            return delay(
                appointments
                    .filter((row) => dateKey(new Date(row.startsAt)) === key)
                    .filter((row) => typeof branchId !== 'string' || row.branchId === branchId)
                    .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
            );
        }

        case 'appointment.byId':
            return delay(requireAppointment(stringField(input, 'id')));

        case 'appointment.walkIn': {
            const patientRef = field(input, 'patient');
            const durationMinutes = Number(field(input, 'durationMinutes') ?? 30);
            const startsAt = new Date().toISOString();
            assertFree(startsAt, durationMinutes);

            let patient: StoredPatient | undefined;
            if (field(patientRef, 'kind') === 'existing') {
                const patientId = stringField(patientRef, 'patientId');
                patient = patients.find((p) => p.id === patientId);
                if (!patient) throw new RequestError(ERROR_CODE.NOT_FOUND, 'patient not found');
            } else {
                patient = {
                    id: id('aaaa'),
                    name: stringField(patientRef, 'name'),
                    phone: stringField(patientRef, 'phone'),
                };
                patients.push(patient);
            }

            const appointment = seedAppointment(
                todayKey(),
                minutesOfDay(startsAt),
                durationMinutes,
                patients.indexOf(patient),
                'checked_in',
                'walk_in',
            );
            appointment.startsAt = startsAt;
            const visit = seedVisit(appointment.id, 30_000, 0);
            return delay({ appointment, visitId: visit.id });
        }

        case 'appointment.cancel': {
            const row = requireAppointment(stringField(input, 'id'));
            row.status = 'cancelled';
            return delay(row);
        }

        case 'appointment.update': {
            const row = requireAppointment(stringField(input, 'id'));
            const startsAt = field(input, 'startsAt');
            const durationMinutes = field(input, 'durationMinutes');
            if (typeof startsAt === 'string' || typeof durationMinutes === 'number') {
                const nextStart = typeof startsAt === 'string' ? startsAt : row.startsAt;
                const nextDuration =
                    typeof durationMinutes === 'number' ? durationMinutes : row.durationMinutes;
                assertFree(nextStart, nextDuration, row.id);
                row.startsAt = nextStart;
                row.durationMinutes = nextDuration;
            }
            if (field(input, 'status') === 'no_show') row.status = 'no_show';
            return delay(row);
        }

        case 'appointment.awaitPayment': {
            const row = requireAppointment(stringField(input, 'id'));
            row.status = 'awaiting_payment';
            return delay(row);
        }

        case 'visit.checkIn': {
            const row = requireAppointment(stringField(input, 'appointmentId'));
            if (visits.some((v) => v.appointmentId === row.id)) {
                throw new RequestError(ERROR_CODE.VISIT_ALREADY_EXISTS, 'this visit already exists');
            }
            row.status = 'checked_in';
            return delay(toRow(seedVisit(row.id, 30_000, 0)));
        }

        case 'visit.byId': {
            const visitId = stringField(input, 'id');
            const visit = visits.find((v) => v.id === visitId);
            if (!visit) throw new RequestError(ERROR_CODE.NOT_FOUND, 'visit not found');
            return delay(visit);
        }

        case 'visit.byAppointment': {
            const appointmentId = stringField(input, 'appointmentId');
            return delay(visits.find((v) => v.appointmentId === appointmentId) ?? null);
        }

        case 'visit.checkOut': {
            const visitId = stringField(input, 'visitId');
            const visit = visits.find((v) => v.id === visitId);
            if (!visit) throw new RequestError(ERROR_CODE.NOT_FOUND, 'visit not found');
            if (visit.completedAt) {
                throw new RequestError(
                    ERROR_CODE.VISIT_ALREADY_COMPLETED,
                    'this visit is already checked out',
                );
            }

            const chargedTotal = Number(field(input, 'chargedTotal') ?? visit.chargedTotal);
            const paid = Number(field(input, 'paidTotal') ?? 0);
            visit.chargedTotal = chargedTotal;
            visit.completedAt = new Date().toISOString();
            if (paid > 0) {
                const method = field(input, 'method');
                const methodNote = field(input, 'methodNote');
                visit.payments.push({
                    id: id('ffff'),
                    amount: paid,
                    // What the sheet sent. Hardcoding cash here would have hidden
                    // a method that never left the screen.
                    method: isPaymentMethod(method) ? method : 'cash',
                    methodNote: typeof methodNote === 'string' ? methodNote : null,
                    paidAt: new Date().toISOString(),
                });
            }
            visit.paidTotal += paid;
            visit.balance = visit.chargedTotal - visit.paidTotal;

            requireAppointment(visit.appointmentId).status = 'done';
            return delay(visit);
        }

        default:
            throw new RequestError(ERROR_CODE.NOT_FOUND, `no fixture for ${path}`);
    }
}

export function fixtureTransport(): Transport {
    return {
        query: (path, input) => call(path, input),
        queryMany: (path, inputs) => Promise.all(inputs.map((input) => call(path, input))),
        mutate: (path, input) => call(path, input),
    };
}
