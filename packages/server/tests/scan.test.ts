import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AppointmentWithPatient, ServerEvent } from '@mawid/shared';
import request from 'supertest';
import { WebSocket } from 'ws';
import { createAppointment } from '../src/modules/appointment/appointment.service.ts';
import { attachWebSocket, closeWebSocket } from '../src/ws/index.ts';
import { atMonday, testApp } from './helpers/app.ts';
import { closeTestDb, openTestDb, resetDb } from './helpers/db.ts';

let app: ReturnType<typeof testApp>;
let server: Server;
let port: number;

beforeAll(async () => {
    app = testApp();
    openTestDb();

    // A real HTTP server with a real websocket attached: the scan-follow is the
    // demo's best moment (spec §9) and it is worth proving end to end rather
    // than by asserting a mock was called.
    server = createServer(app);
    attachWebSocket(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
    await closeWebSocket();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeTestDb();
});

beforeEach(() => {
    resetDb();
});

function book(): AppointmentWithPatient {
    return createAppointment({
        patient: { name: 'منى صلاح', phone: '01001234567' },
        startsAt: atMonday('08:00'),
        typeId: 'cleaning',
    });
}

/** Opens a desk screen and resolves with the first event it is sent. */
async function nextDeskEvent(trigger: () => Promise<unknown>): Promise<ServerEvent> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((resolve) => socket.once('open', resolve));

    const received = new Promise<ServerEvent>((resolve) => {
        socket.once('message', (raw) => resolve(JSON.parse(String(raw)) as ServerEvent));
    });

    await trigger();

    const event = await received;
    socket.close();
    return event;
}

describe('GET /s/:ref — the QR target', () => {
    test('redirects a scanned slip to the patient page', async () => {
        const appointment = book();

        const res = await request(app).get(`/s/${appointment.ref}`).expect(302);
        expect(res.headers.location).toBe(`/p/${appointment.patient.id}`);
    });

    test('makes the desk screen jump to that patient', async () => {
        const appointment = book();

        const event = await nextDeskEvent(() => request(app).get(`/s/${appointment.ref}`).expect(302));

        expect(event.event).toBe('scan');
        expect(event.payload).toEqual({
            appointmentId: appointment.id,
            patientId: appointment.patient.id,
        });
        expect(event.at).toBeString();
    });

    test('a cancelled appointment still opens its patient', async () => {
        const appointment = book();
        await request(app).delete(`/api/appointments/${appointment.id}`).expect(200);

        // The slip is in someone's hand; the record is what they are looking for.
        const res = await request(app).get(`/s/${appointment.ref}`).expect(302);
        expect(res.headers.location).toBe(`/p/${appointment.patient.id}`);
    });

    test('is redirected to a page the SPA serves', async () => {
        const appointment = book();
        const res = await request(app).get(`/s/${appointment.ref}`).expect(302);

        // `/p/:patientId` is not an API route, so it falls through to the SPA.
        // Without a built frontend that is a 503, but never a JSON 404.
        const followed = await request(app).get(res.headers.location as string);
        expect(followed.status).not.toBe(404);
    });
});

describe('a scan that does not resolve', () => {
    test('an unknown ref is a readable page, not a JSON envelope', async () => {
        const res = await request(app).get('/s/030826-99').expect(404);

        expect(res.headers['content-type']).toContain('text/html');
        expect(res.text).toContain('عيادة الأسنان');
        expect(res.text).not.toContain('"success"');
    });

    test('a malformed ref is a readable page too', async () => {
        const res = await request(app).get('/s/NOTAREF').expect(400);

        expect(res.headers['content-type']).toContain('text/html');
        expect(res.text).toContain('Dental Clinic');
    });

    test('a failed scan tells nobody it happened', async () => {
        // No appointment, so nothing to announce — the desk must not jump.
        const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        await new Promise((resolve) => socket.once('open', resolve));

        const events: string[] = [];
        socket.on('message', (raw) => events.push(String(raw)));

        await request(app).get('/s/030826-99').expect(404);
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(events).toHaveLength(0);
        socket.close();
    });
});

describe('the route is reachable at all', () => {
    test('/s/:ref is not swallowed by the SPA catch-all', async () => {
        const appointment = book();

        // If `serveFrontend` were mounted first this would be a 200 of
        // index.html — or a 503 — instead of a redirect, and a scanned slip
        // would silently open the desk view.
        const res = await request(app).get(`/s/${appointment.ref}`);
        expect(res.status).toBe(302);
    });
});
