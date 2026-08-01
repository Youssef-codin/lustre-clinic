import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type {
    ApiResponse,
    AppointmentWithPatient,
    DayAppointments,
    Patient,
    PatientDetail,
    PatientSummary,
    SlotsResponse,
} from '@mawid/shared';
import request from 'supertest';
import type { createApp } from '../src/app.ts';
import { atMonday, FRIDAY, MONDAY, testApp } from './helpers/app.ts';
import { closeTestDb, openTestDb, resetDb } from './helpers/db.ts';

let app: ReturnType<typeof createApp>;

beforeAll(() => {
    app = testApp();
    openTestDb();
});

afterAll(() => {
    closeTestDb();
});

beforeEach(() => {
    resetDb();
});

/** Unwraps the envelope, failing the test with the server's message on error. */
function data<T>(body: ApiResponse<T>): T {
    if (!body.success) throw new Error(`${body.error.code}: ${body.error.message}`);
    return body.data;
}

async function bookWalkIn(startsAt: string, typeId = 'cleaning', name = 'وليد حسن') {
    const res = await request(app)
        .post('/api/appointments')
        .send({ patient: { name, phone: '010 1234-5678' }, startsAt, typeId })
        .expect(201);
    return data<AppointmentWithPatient>(res.body);
}

describe('POST /api/appointments', () => {
    test('books a walk-in, creating the patient in the same request', async () => {
        const appointment = await bookWalkIn(atMonday('08:00'));

        expect(appointment.startsAt).toBe(atMonday('08:00'));
        expect(appointment.status).toBe('booked');
        expect(appointment.channel).toBe('desk');
        // Duration comes from config, not the request.
        expect(appointment.durationMin).toBe(30);
        expect(appointment.ref).toMatch(/^[A-Z0-9]{5}$/);
        // The phone was typed with a space and a dash, and comes back E.164.
        expect(appointment.patient.phone).toBe('+201012345678');
    });

    test('books an existing patient by id', async () => {
        const created = data<Patient>(
            (await request(app).post('/api/patients').send({ name: 'هدى', phone: '01111111111' }).expect(201))
                .body,
        );

        const res = await request(app)
            .post('/api/appointments')
            .send({ patientId: created.id, startsAt: atMonday('08:00'), typeId: 'checkup' })
            .expect(201);

        expect(data<AppointmentWithPatient>(res.body).patient.id).toBe(created.id);
    });

    test('a second walk-in on the same phone is the same patient', async () => {
        const first = await bookWalkIn(atMonday('08:00'));
        const second = await bookWalkIn(atMonday('09:00'));

        expect(second.patient.id).toBe(first.patient.id);
    });

    test('a taken slot is a 409 SLOT_TAKEN', async () => {
        await bookWalkIn(atMonday('08:00'));

        const res = await request(app)
            .post('/api/appointments')
            .send({
                patient: { name: 'أحمد', phone: '01222222222' },
                startsAt: atMonday('08:15'),
                typeId: 'checkup',
            })
            .expect(409);

        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('SLOT_TAKEN');
    });

    test('a closed day is a 422 OUTSIDE_WORKING_HOURS', async () => {
        const res = await request(app)
            .post('/api/appointments')
            .send({
                patient: { name: 'أحمد', phone: '01222222222' },
                startsAt: `${FRIDAY}T08:00:00.000Z`,
                typeId: 'checkup',
            })
            .expect(422);

        expect(res.body.error.code).toBe('OUTSIDE_WORKING_HOURS');
    });

    test('an unknown appointment type is a 400', async () => {
        await request(app)
            .post('/api/appointments')
            .send({
                patient: { name: 'أحمد', phone: '01222222222' },
                startsAt: atMonday('08:00'),
                typeId: 'facelift',
            })
            .expect(400);
    });

    test('neither a patientId nor an inline patient is a validation failure', async () => {
        const res = await request(app)
            .post('/api/appointments')
            .send({ startsAt: atMonday('08:00'), typeId: 'checkup' })
            .expect(400);

        expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    test('a local-time startsAt is rejected — the db holds UTC only', async () => {
        await request(app)
            .post('/api/appointments')
            .send({
                patient: { name: 'أحمد', phone: '01222222222' },
                startsAt: '2026-08-03T10:00:00+03:00',
                typeId: 'checkup',
            })
            .expect(400);
    });
});

describe('GET /api/appointments', () => {
    test('returns the clinic-local day in time order, with patients embedded', async () => {
        await bookWalkIn(atMonday('09:00'), 'cleaning', 'ثاني');
        await bookWalkIn(atMonday('08:00'), 'cleaning', 'أول');

        const res = await request(app).get('/api/appointments').query({ date: MONDAY }).expect(200);
        const day = data<DayAppointments>(res.body);

        expect(day.map((a) => a.startsAt)).toEqual([atMonday('08:00'), atMonday('09:00')]);
        expect(day[0]?.patient.name).toBeString();
    });

    test('an evening appointment counts as the clinic day, not the UTC day', async () => {
        // 20:30 Cairo on the Monday is 17:30Z — same UTC day here, but the bound
        // that matters is the clinic one, which runs to 21:00Z.
        await bookWalkIn(atMonday('17:30'));

        const day = data<DayAppointments>(
            (await request(app).get('/api/appointments').query({ date: MONDAY }).expect(200)).body,
        );
        expect(day).toHaveLength(1);
    });

    test('cancelled appointments stay in the day view, carrying their status', async () => {
        const appointment = await bookWalkIn(atMonday('08:00'));
        await request(app).delete(`/api/appointments/${appointment.id}`).expect(200);

        const day = data<DayAppointments>(
            (await request(app).get('/api/appointments').query({ date: MONDAY }).expect(200)).body,
        );
        expect(day).toHaveLength(1);
        expect(day[0]?.status).toBe('cancelled');
    });

    test('a missing date is a validation failure, not an empty day', async () => {
        await request(app).get('/api/appointments').expect(400);
    });
});

describe('PATCH and DELETE /api/appointments/:id', () => {
    test('moving an appointment updates it', async () => {
        const appointment = await bookWalkIn(atMonday('08:00'));

        const res = await request(app)
            .patch(`/api/appointments/${appointment.id}`)
            .send({ startsAt: atMonday('09:00') })
            .expect(200);

        expect(data<AppointmentWithPatient>(res.body).startsAt).toBe(atMonday('09:00'));
    });

    test('changing the type re-reads the duration from config', async () => {
        const appointment = await bookWalkIn(atMonday('08:00'), 'checkup');
        expect(appointment.durationMin).toBe(20);

        const res = await request(app)
            .patch(`/api/appointments/${appointment.id}`)
            .send({ typeId: 'rootcanal' })
            .expect(200);

        expect(data<AppointmentWithPatient>(res.body).durationMin).toBe(90);
    });

    test('an empty patch body is rejected', async () => {
        const appointment = await bookWalkIn(atMonday('08:00'));
        await request(app).patch(`/api/appointments/${appointment.id}`).send({}).expect(400);
    });

    test('delete cancels rather than removing', async () => {
        const appointment = await bookWalkIn(atMonday('08:00'));

        const res = await request(app).delete(`/api/appointments/${appointment.id}`).expect(200);
        expect(data<AppointmentWithPatient>(res.body).status).toBe('cancelled');

        // still fetchable — the history is the audit trail
        await request(app).get(`/api/appointments/${appointment.id}`).expect(200);
    });

    test('an unknown id is a 404 APPOINTMENT_NOT_FOUND', async () => {
        const res = await request(app).get('/api/appointments/9999').expect(404);
        expect(res.body.error.code).toBe('APPOINTMENT_NOT_FOUND');
    });

    test('a non-numeric id is a 400, not a 404', async () => {
        await request(app).get('/api/appointments/abc').expect(400);
    });
});

describe('GET /api/slots', () => {
    test('offers slots across both of the day’s windows', async () => {
        const res = await request(app)
            .get('/api/slots')
            .query({ date: MONDAY, typeId: 'cleaning' })
            .expect(200);
        const slots = data<SlotsResponse>(res.body);

        expect(slots.durationMin).toBe(30);
        // 07:00–11:00Z and 14:00–18:00Z, 30 minutes each → 8 + 8
        expect(slots.slots).toHaveLength(16);
        expect(slots.slots[0]?.startsAt).toBe(atMonday('07:00'));
        expect(slots.slots.at(-1)?.startsAt).toBe(atMonday('17:30'));
    });

    test('a booking removes the slots it covers and packs against it', async () => {
        await bookWalkIn(atMonday('07:00'), 'checkup'); // 20 minutes, 07:00–07:20

        const slots = data<SlotsResponse>(
            (await request(app).get('/api/slots').query({ date: MONDAY, typeId: 'checkup' }).expect(200))
                .body,
        );

        // The next opening is tight against the existing appointment, not on a grid.
        expect(slots.slots[0]?.startsAt).toBe(atMonday('07:20'));
    });

    test('a closed day has no slots and is not an error', async () => {
        const slots = data<SlotsResponse>(
            (await request(app).get('/api/slots').query({ date: FRIDAY, typeId: 'cleaning' }).expect(200))
                .body,
        );
        expect(slots.slots).toHaveLength(0);
    });

    test('a longer type sees fewer slots in the same day', async () => {
        const short = data<SlotsResponse>(
            (await request(app).get('/api/slots').query({ date: MONDAY, typeId: 'checkup' })).body,
        );
        const long = data<SlotsResponse>(
            (await request(app).get('/api/slots').query({ date: MONDAY, typeId: 'rootcanal' })).body,
        );

        expect(long.slots.length).toBeLessThan(short.slots.length);
    });

    test('every offered slot is actually bookable', async () => {
        const slots = data<SlotsResponse>(
            (await request(app).get('/api/slots').query({ date: MONDAY, typeId: 'rootcanal' })).body,
        );

        for (const slot of slots.slots) {
            await request(app)
                .post('/api/appointments')
                .send({
                    patient: { name: 'اختبار', phone: '01000000000' },
                    startsAt: slot.startsAt,
                    typeId: 'rootcanal',
                })
                .expect(201);
        }
    });

    test('a missing typeId is a validation failure', async () => {
        await request(app).get('/api/slots').query({ date: MONDAY }).expect(400);
    });
});

describe('patients', () => {
    test('creates, normalizes the phone, and reads back', async () => {
        const created = data<Patient>(
            (
                await request(app)
                    .post('/api/patients')
                    .send({ name: 'منى صلاح', phone: '0100 123 4567', notes: 'حساسية بنسلين' })
                    .expect(201)
            ).body,
        );

        expect(created.phone).toBe('+201001234567');
        expect(created.notes).toBe('حساسية بنسلين');
    });

    test('search matches on name and on any form of the phone', async () => {
        await request(app).post('/api/patients').send({ name: 'منى صلاح', phone: '01001234567' }).expect(201);

        const byName = data<PatientSummary[]>(
            (await request(app).get('/api/patients').query({ q: 'منى' }).expect(200)).body,
        );
        expect(byName).toHaveLength(1);

        for (const q of ['01001234567', '+201001234567', '1001234567']) {
            const found = data<PatientSummary[]>(
                (await request(app).get('/api/patients').query({ q }).expect(200)).body,
            );
            expect(found).toHaveLength(1);
        }
    });

    test('search results never carry notes', async () => {
        await request(app)
            .post('/api/patients')
            .send({ name: 'منى', phone: '01001234567', notes: 'private' })
            .expect(201);

        const found = data<PatientSummary[]>(
            (await request(app).get('/api/patients').query({ q: 'منى' }).expect(200)).body,
        );
        expect(found[0]).not.toHaveProperty('notes');
    });

    test('the patient page carries the whole history, newest first', async () => {
        const first = await bookWalkIn(atMonday('08:00'));
        await bookWalkIn(atMonday('09:00'));

        const detail = data<PatientDetail>(
            (await request(app).get(`/api/patients/${first.patient.id}`).expect(200)).body,
        );

        expect(detail.patient.id).toBe(first.patient.id);
        expect(detail.appointments.map((a) => a.startsAt)).toEqual([atMonday('09:00'), atMonday('08:00')]);
    });

    test('patching a phone re-normalizes it', async () => {
        const created = data<Patient>(
            (await request(app).post('/api/patients').send({ name: 'منى', phone: '01001234567' })).body,
        );

        const updated = data<Patient>(
            (
                await request(app)
                    .patch(`/api/patients/${created.id}`)
                    .send({ phone: '0102 000 0000' })
                    .expect(200)
            ).body,
        );
        expect(updated.phone).toBe('+201020000000');
    });

    test('an unknown patient is a 404 PATIENT_NOT_FOUND', async () => {
        const res = await request(app).get('/api/patients/9999').expect(404);
        expect(res.body.error.code).toBe('PATIENT_NOT_FOUND');
    });

    test('a too-short name is rejected with the field path', async () => {
        const res = await request(app)
            .post('/api/patients')
            .send({ name: 'م', phone: '01001234567' })
            .expect(400);

        expect(res.body.error.code).toBe('VALIDATION_FAILED');
        expect(res.body.error.issues[0].path).toBe('body.name');
    });
});
