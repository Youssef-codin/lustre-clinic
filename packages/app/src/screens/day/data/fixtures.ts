import { ERROR_CODE, PAYMENT_METHODS, type PaymentMethod, SLOT_HOLDING_STATUSES } from '@mawid/shared';
import { addDays, dateKey, isoAt, minutesOfDay, todayKey } from '../time';
import { RequestError, type Transport } from './client';
import type { Appointment, ClinicDay, Visit, VisitRow } from './types';

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

function seedAppointment(
    dayKey: string,
    minutes: number,
    durationMinutes: number,
    patientIndex: number,
    status: Appointment['status'],
    channel: Appointment['channel'] = 'desk',
): Appointment {
    const patient = patients[patientIndex % patients.length];
    if (!patient) throw new Error('fixture patient missing');

    const appointment: Appointment = {
        id: id('bbbb'),
        ref: `${dayKey.slice(8, 10)}${dayKey.slice(5, 7)}${dayKey.slice(2, 4)}-${String(sequence).padStart(4, '0').slice(-4).toUpperCase()}`,
        patientId: patient.id,
        branchId: BRANCH_ID,
        startsAt: isoAt(dayKey, minutes),
        durationMinutes,
        typeId: null,
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

seedAppointment(today, 10 * 60, 30, 0, 'done');
const inChair = seedAppointment(today, 11 * 60, 45, 1, 'checked_in');
seedVisit(inChair.id, 30_000, 0);
seedAppointment(today, 12 * 60 + 30, 30, 2, 'booked');
seedAppointment(today, 14 * 60, 20, 3, 'no_show');
seedAppointment(today, 17 * 60, 45, 4, 'booked');
seedAppointment(today, 18 * 60, 30, 1, 'cancelled');
seedAppointment(addDays(today, 1), 11 * 60, 30, 2, 'booked');
seedAppointment(addDays(today, 1), 15 * 60, 45, 0, 'booked');
seedAppointment(addDays(today, 2), 13 * 60, 30, 4, 'booked');

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

        case 'branch.list':
            return delay([{ id: BRANCH_ID, name: 'Maadi', address: null, active: true }]);

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
            return delay(
                appointments
                    .filter((row) => dateKey(new Date(row.startsAt)) === key)
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
