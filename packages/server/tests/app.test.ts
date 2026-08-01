import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    type ApiResponse,
    appointmentTypeLabel,
    clinicAddress,
    type HealthResponse,
    type PublicConfig,
} from '@mawid/shared';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { configSchema } from '../src/config/config.schema.ts';
import { loadConfig, setConfig } from '../src/config/index.ts';

const EXAMPLE_CONFIG = resolve(import.meta.dir, '../../../config.example.json');

let app: ReturnType<typeof createApp>;

beforeAll(() => {
    setConfig(loadConfig(EXAMPLE_CONFIG));
    app = createApp();
});

describe('GET /api/health', () => {
    test('reports component status in the response envelope', async () => {
        const res = await request(app).get('/api/health');
        const body = res.body as ApiResponse<HealthResponse>;

        expect(body.success).toBe(true);
        if (!body.success) return;
        expect(body.data.version).toBeString();
        expect(body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
});

describe('GET /api/config', () => {
    test('returns only the clinic-facing slice of config.json', async () => {
        const res = await request(app).get('/api/config').expect(200);
        const body = res.body as ApiResponse<PublicConfig>;

        expect(body.success).toBe(true);
        if (!body.success) return;
        expect(body.data.clinic.timezone).toBe('Africa/Cairo');
        expect(body.data.appointmentTypes.length).toBeGreaterThan(0);
        expect(body.data).not.toHaveProperty('whatsapp');
        expect(body.data).not.toHaveProperty('backups');
    });

    test('carries what the frontend needs to render either locale', async () => {
        const res = await request(app).get('/api/config').expect(200);
        const body = res.body as ApiResponse<PublicConfig>;

        expect(body.success).toBe(true);
        if (!body.success) return;
        expect(body.data.defaultLocale).toBe('ar');
        expect(body.data.clinic.name).not.toBe(body.data.clinic.nameEn);
        for (const type of body.data.appointmentTypes) {
            expect(appointmentTypeLabel(type, 'ar')).toBeString();
            expect(appointmentTypeLabel(type, 'en')).toBeString();
        }
    });
});

describe('localization of config values', () => {
    test('defaultLocale falls back to ar when a config omits it', () => {
        const raw = JSON.parse(readFileSync(EXAMPLE_CONFIG, 'utf8')) as Record<string, unknown>;
        delete raw.defaultLocale;

        const parsed = configSchema.parse(raw);
        expect(parsed.defaultLocale).toBe('ar');
    });

    test('a type with no labelEn shows its Arabic label in both locales', () => {
        const type = { id: 'other', label: 'أخرى', minutes: 30 };

        expect(appointmentTypeLabel(type, 'ar')).toBe('أخرى');
        expect(appointmentTypeLabel(type, 'en')).toBe('أخرى');
    });

    test('address falls back to Arabic when addressEn is missing', () => {
        const clinic = {
            name: 'ع',
            nameEn: 'C',
            phone: '+20',
            address: 'شارع',
            timezone: 'Africa/Cairo',
        };

        expect(clinicAddress(clinic, 'en')).toBe('شارع');
        expect(clinicAddress({ ...clinic, addressEn: '12 St' }, 'en')).toBe('12 St');
    });
});

describe('unknown routes', () => {
    test('an unknown /api route is a JSON 404, not the SPA', async () => {
        const res = await request(app).get('/api/nope').expect(404);
        const body = res.body as ApiResponse<never>;

        expect(body.success).toBe(false);
        if (body.success) return;
        expect(body.error.code).toBe('NOT_FOUND');
    });
});
