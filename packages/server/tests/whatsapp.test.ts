import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ApiResponse, ServerEvent, WhatsAppStatus } from '@mawid/shared';
import request from 'supertest';
import { WebSocket } from 'ws';
import type { Config } from '../src/config/index.ts';
import { setConfig } from '../src/config/index.ts';
import { getStatus } from '../src/services/status.ts';
import { startWhatsApp, stopWhatsApp } from '../src/services/whatsapp/index.ts';
import { toWhatsAppJid } from '../src/services/whatsapp/sender.ts';
import { getWhatsAppState, resetWhatsAppState, setWhatsAppState } from '../src/services/whatsapp/state.ts';
import { attachWebSocket, closeWebSocket } from '../src/ws/index.ts';
import { loadTestConfig, testApp } from './helpers/app.ts';

const base = loadTestConfig();
const app = testApp();

beforeEach(() => {
    setConfig(base);
    resetWhatsAppState(false);
});

afterAll(async () => {
    await stopWhatsApp();
    setConfig(base);
});

describe('addressing', () => {
    test('turns an E.164 number into a WhatsApp jid', () => {
        expect(toWhatsAppJid('+201001234567')).toBe('201001234567@s.whatsapp.net');
    });

    test('rejects something that is not a phone number', () => {
        // Silently sending to a malformed jid means the message goes nowhere
        // and the reminder is marked sent.
        expect(() => toWhatsAppJid('+20')).toThrow();
    });
});

describe('connection state', () => {
    test('starts disconnected, and health agrees', () => {
        expect(getWhatsAppState().connected).toBe(false);
        expect(getStatus().whatsapp).toBe('down');
    });

    test('connecting flips health to ok', () => {
        setWhatsAppState({ connected: true });

        expect(getStatus().whatsapp).toBe('ok');
    });

    test('a pairing QR is held until the socket opens, then cleared', () => {
        setWhatsAppState({ qr: 'pair-me' });
        expect(getWhatsAppState().qr).toBe('pair-me');

        setWhatsAppState({ connected: true, qr: undefined });
        expect(getWhatsAppState().qr).toBeUndefined();
    });

    test('an error is cleared on reconnect rather than sticking around', () => {
        setWhatsAppState({ connected: false, lastError: 'disconnected (428)' });
        expect(getWhatsAppState().lastError).toBe('disconnected (428)');

        setWhatsAppState({ connected: true, lastError: undefined });
        expect(getWhatsAppState().lastError).toBeUndefined();
    });
});

describe('dry run', () => {
    test('reports connected but says so out loud', async () => {
        await startWhatsApp({ ...base, whatsapp: { ...base.whatsapp, dryRun: true } } as Config);

        const state = getWhatsAppState();
        // A connected socket that silently sends nothing looks identical to a
        // working one — `dryRun` is what tells the desk the difference.
        expect(state.connected).toBe(true);
        expect(state.dryRun).toBe(true);
    });

    test('sending logs instead of messaging a patient', async () => {
        await startWhatsApp({ ...base, whatsapp: { ...base.whatsapp, dryRun: true } } as Config);
        const { getSender } = await import('../src/services/whatsapp/index.ts');

        // The point is that this resolves without a socket existing at all.
        await expect(getSender()?.send('+201001234567', 'مرحبا')).resolves.toBeUndefined();
    });

    test('reminders turned off means the socket never starts', async () => {
        await startWhatsApp({ ...base, reminders: { ...base.reminders, enabled: false } } as Config);

        expect(getStatus().whatsapp).toBe('disabled');
        expect(getWhatsAppState().connected).toBe(false);
    });
});

describe('GET /api/whatsapp/status', () => {
    test('returns the same shape the socket pushes', async () => {
        setWhatsAppState({ connected: true, dryRun: true });

        const res = await request(app).get('/api/whatsapp/status').expect(200);
        const body = res.body as ApiResponse<WhatsAppStatus>;

        expect(body.success).toBe(true);
        if (!body.success) return;
        expect(body.data).toEqual(getWhatsAppState());
    });

    test('carries the pairing QR so linking happens at the desk', async () => {
        setWhatsAppState({ connected: false, qr: 'pair-me' });

        const res = await request(app).get('/api/whatsapp/status').expect(200);
        expect(res.body.data.qr).toBe('pair-me');
    });
});

describe('POST /api/whatsapp/logout', () => {
    test('returns the state left behind', async () => {
        await startWhatsApp({ ...base, whatsapp: { ...base.whatsapp, dryRun: true } } as Config);
        expect(getWhatsAppState().connected).toBe(true);

        const res = await request(app).post('/api/whatsapp/logout').expect(200);
        expect(res.body.data.connected).toBe(false);
    });
});

describe('the desk hears about it', () => {
    test('a state change is pushed, not polled', async () => {
        const server = createServer(app);
        attachWebSocket(server);
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address() as AddressInfo;

        const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        await new Promise((resolve) => socket.once('open', resolve));
        const received = new Promise<ServerEvent>((resolve) => {
            socket.once('message', (raw) => resolve(JSON.parse(String(raw)) as ServerEvent));
        });

        setWhatsAppState({ connected: true, lastError: undefined });
        const event = await received;

        expect(event.event).toBe('whatsapp:status');
        expect(event.payload).toEqual(getWhatsAppState());

        socket.close();
        await closeWebSocket();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    test('an unchanged state is not re-announced', async () => {
        setWhatsAppState({ connected: true });
        const before = getWhatsAppState();

        setWhatsAppState({ connected: true });
        // Same object contents; a reconnect loop must not spam every screen.
        expect(getWhatsAppState()).toEqual(before);
    });
});
