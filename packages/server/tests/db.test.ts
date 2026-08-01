import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { getSqlite, schema } from '../src/db/index.ts';
import { applyMigrations } from '../src/db/migrate.ts';
import { MIGRATIONS } from '../src/db/migrations.generated.ts';
import { getStatus } from '../src/services/status.ts';
import { closeTestDb, openTestDb, resetDb } from './helpers/db.ts';

let db: ReturnType<typeof openTestDb>;

beforeAll(() => {
    db = openTestDb();
});

afterAll(() => {
    closeTestDb();
});

beforeEach(() => {
    resetDb();
});

const patient = { name: 'Test Patient', phone: '+201000000001', createdAt: '2026-08-01T09:00:00.000Z' };

function insertPatient() {
    return db.insert(schema.patients).values(patient).returning().get();
}

describe('migrations', () => {
    test('every committed migration is embedded in the binary', () => {
        expect(MIGRATIONS.length).toBeGreaterThan(0);
        for (const migration of MIGRATIONS) {
            expect(migration.sql.trim().length).toBeGreaterThan(0);
            expect(migration.tag).toMatch(/^\d{4}_/);
        }
    });

    test('creates every table the spec defines', () => {
        const names = getSqlite()
            .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
            .all()
            .map((r) => r.name);

        expect(names).toContain('patients');
        expect(names).toContain('appointments');
        expect(names).toContain('reminders');
    });

    test('records the applied version for /api/health', () => {
        expect(getStatus().migration).toBe(MIGRATIONS.at(-1)?.tag ?? null);
        expect(getStatus().db).toBe('ok');
    });

    test('re-running applies nothing — boot on an up-to-date install is a no-op', () => {
        const again = applyMigrations(getSqlite());
        expect(again.applied).toBe(0);
        expect(again.version).toBe(MIGRATIONS.at(-1)?.tag ?? null);
    });
});

describe('constraints', () => {
    test('a reminder can only exist once per appointment', () => {
        const p = insertPatient();
        const appt = db
            .insert(schema.appointments)
            .values({
                ref: 'M7K2Q',
                patientId: p.id,
                startsAt: '2026-08-02T08:00:00.000Z',
                durationMin: 30,
                typeId: 'checkup',
                createdAt: patient.createdAt,
                updatedAt: patient.createdAt,
            })
            .returning()
            .get();

        const reminder = {
            appointmentId: appt.id,
            status: 'pending' as const,
            scheduledFor: '2026-08-01T14:00:00.000Z',
        };

        db.insert(schema.reminders).values(reminder).run();
        expect(() => db.insert(schema.reminders).values(reminder).run()).toThrow();
    });

    test('appointment refs are unique', () => {
        const p = insertPatient();
        const appt = {
            ref: 'DUPE1',
            patientId: p.id,
            startsAt: '2026-08-02T08:00:00.000Z',
            durationMin: 30,
            typeId: 'checkup',
            createdAt: patient.createdAt,
            updatedAt: patient.createdAt,
        };

        db.insert(schema.appointments).values(appt).run();
        expect(() =>
            db
                .insert(schema.appointments)
                .values({ ...appt, startsAt: '2026-08-03T08:00:00.000Z' })
                .run(),
        ).toThrow();
    });

    test('foreign keys are enforced — an appointment needs a real patient', () => {
        expect(() =>
            db
                .insert(schema.appointments)
                .values({
                    ref: 'ORPHN',
                    patientId: 9999,
                    startsAt: '2026-08-02T08:00:00.000Z',
                    durationMin: 30,
                    typeId: 'checkup',
                    createdAt: patient.createdAt,
                    updatedAt: patient.createdAt,
                })
                .run(),
        ).toThrow();
    });

    test('status and channel default to booked/desk', () => {
        const p = insertPatient();
        const appt = db
            .insert(schema.appointments)
            .values({
                ref: 'DEF01',
                patientId: p.id,
                startsAt: '2026-08-02T08:00:00.000Z',
                durationMin: 30,
                typeId: 'checkup',
                createdAt: patient.createdAt,
                updatedAt: patient.createdAt,
            })
            .returning()
            .get();

        expect(appt.status).toBe('booked');
        expect(appt.channel).toBe('desk');
    });
});
