import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { ERROR_CODE } from '@lustre/shared';
import { appointmentService } from '../src/modules/appointment/appointment.service.ts';
import { patientService } from '../src/modules/patient/patient.service.ts';
import { visitService } from '../src/modules/visit/visit.service.ts';
import { setupDatabase, sql, truncateAll } from './helpers/db.ts';
import { clinic, expectAppError, slot } from './helpers/factories.ts';

/**
 * SPEC §7, §13 — the calls that write to several tables at once. `create` builds
 * a patient, an appointment, and a reminder; `walkIn` adds a visit and a seeded
 * procedure line on top. Each runs in one transaction, and the reason that
 * matters is what the database looks like after a booking that failed halfway:
 * the patient is created before the appointment insert that fails, so without a
 * transaction a leaked patient row would sit in `patient.search` forever with
 * no appointment attached. A foreign-key failure (unknown branch) is raised by
 * Postgres rather than a guard, so the rollback is the entire defense.
 *
 * Invariants: an appointment can never exist without its reminder; a walk-in
 * retires its reminder (skipped) in the same transaction; check-in ships the
 * visit, its seeded line, and the status change together; `setProcedures`
 * replaces the whole list, so a rejected line must leave the old lines intact.
 */

async function countOf(table: string): Promise<number> {
    const [row] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM ${sql(table)}`;
    return Number(row?.n ?? 0);
}

async function snapshot() {
    return {
        patients: await countOf('patients'),
        appointments: await countOf('appointments'),
        reminders: await countOf('reminders'),
        visits: await countOf('visits'),
        visitProcedures: await countOf('visit_procedures'),
    };
}

beforeAll(async () => {
    await setupDatabase();
});

beforeEach(async () => {
    await truncateAll();
});

describe('appointment.create', () => {
    test('an overlap rolls back the patient it was about to create', async () => {
        const fixtures = await clinic();
        const startsAt = slot();
        await appointmentService.create({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            startsAt,
            offsetMinutes: 0,
        });

        const before = await snapshot();

        await expectAppError(ERROR_CODE.SLOT_OVERLAP, () =>
            appointmentService.create({
                patient: { kind: 'new', name: 'Walk-up Wael', phone: '01099999999' },
                branchId: fixtures.branch.id,
                startsAt,
                offsetMinutes: 0,
            }),
        );

        expect(await snapshot()).toEqual(before);
        expect(await patientService.search({ q: 'Wael', limit: 25 })).toEqual([]);
    });

    test('an unknown branch rolls back the patient and the reminder', async () => {
        await clinic();
        const before = await snapshot();

        await expect(
            appointmentService.create({
                patient: { kind: 'new', name: 'Ghost Patient', phone: '01088888888' },
                branchId: Bun.randomUUIDv7(),
                startsAt: slot(),
                offsetMinutes: 0,
            }),
        ).rejects.toThrow();

        expect(await snapshot()).toEqual(before);
    });

    test('an unknown existing patient books nothing', async () => {
        const fixtures = await clinic();
        const before = await snapshot();

        await expectAppError(ERROR_CODE.NOT_FOUND, () =>
            appointmentService.create({
                patient: { kind: 'existing', patientId: Bun.randomUUIDv7() },
                branchId: fixtures.branch.id,
                startsAt: slot(),
                offsetMinutes: 0,
            }),
        );

        expect(await snapshot()).toEqual(before);
    });

    test('a successful booking writes the appointment and its reminder together', async () => {
        const fixtures = await clinic();
        const before = await snapshot();

        await appointmentService.create({
            patient: { kind: 'new', name: 'New Patient', phone: '01077777777' },
            branchId: fixtures.branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });

        const after = await snapshot();
        // §11 — an appointment can never exist without its reminder.
        expect(after.patients).toBe(before.patients + 1);
        expect(after.appointments).toBe(before.appointments + 1);
        expect(after.reminders).toBe(before.reminders + 1);
    });
});

describe('appointment.walkIn', () => {
    test('a second walk-in queues behind the first rather than being refused', async () => {
        // The widest transaction in the app: four tables, plus the seeded
        // checkup line. `starts_at` is now, so the first walk-in is still in the
        // chair when the second arrives — and §7 says the second is taken
        // anyway, seated at the end of the first, with its whole set of rows
        // written. It is not an overlap, so there is nothing to roll back.
        const fixtures = await clinic();
        const first = await appointmentService.walkIn({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            offsetMinutes: 0,
        });

        const before = await snapshot();

        const second = await appointmentService.walkIn({
            patient: { kind: 'new', name: 'Second Walk-up', phone: '01066666666' },
            branchId: fixtures.branch.id,
            offsetMinutes: 0,
        });

        expect(second.appointment.startsAt.getTime()).toBe(
            first.appointment.startsAt.getTime() + first.appointment.durationMinutes * 60_000,
        );

        const after = await snapshot();
        expect(after.patients).toBe(before.patients + 1);
        expect(after.appointments).toBe(before.appointments + 1);
        expect(after.reminders).toBe(before.reminders + 1);
        expect(after.visits).toBe(before.visits + 1);
        expect(await patientService.search({ q: 'Second', limit: 25 })).toHaveLength(1);
    });

    // Four desks answering at once is not the clinic, but it is the only way to
    // put four transactions inside each other's window on purpose. Under READ
    // COMMITTED they plan against the same committed day and all but one lose
    // the insert to `appointments_no_overlap`; the loser's answer is stale, not
    // wrong, so it re-reads and queues rather than turning a patient away.
    test('walk-ins taken at the same moment queue instead of refusing each other', async () => {
        const fixtures = await clinic();

        // `allSettled`, not `all`: a rejection must not let the test return
        // while the other three transactions are still open, or the next
        // `truncateAll` deadlocks against them and takes the rest of the file
        // down with it.
        const settled = await Promise.allSettled(
            [1, 2, 3, 4].map((n) =>
                appointmentService.walkIn({
                    patient: { kind: 'new', name: `Rush ${n}`, phone: `0107777777${n}` },
                    branchId: fixtures.branch.id,
                    offsetMinutes: 0,
                }),
            ),
        );

        const refused = settled.filter((r) => r.status === 'rejected');
        expect(refused.map((r) => String(r.reason))).toEqual([]);

        // Read the day back rather than trusting what each call returned: a
        // walk-in taken later pushes the ones already placed, so the row a
        // caller was handed can be out of date by the time all four are in.
        // The clients are told by the APPOINTMENT_UPDATED each move broadcasts.
        const rows = await sql<{ starts_at: string; duration_minutes: number }[]>`
            SELECT starts_at, duration_minutes FROM appointments ORDER BY starts_at
        `;
        expect(rows).toHaveLength(4);

        const starts = rows.map((row) => new Date(row.starts_at).getTime());

        // Every one of them got a slot, and no two share one.
        expect(new Set(starts).size).toBe(4);

        // Back to back, in the duration the settings gave them.
        const gaps = starts.slice(1).map((start, i) => start - (starts[i] ?? 0));
        expect(gaps).toEqual(rows.slice(0, -1).map((row) => row.duration_minutes * 60_000));
    });

    test('a successful walk-in leaves its reminder skipped, not pending', async () => {
        // The patient is standing at the desk, so the reminder is created and
        // immediately retired in the same transaction. A pending row here would
        // put somebody on the reminder screen who is already being treated.
        const fixtures = await clinic();

        const { appointment } = await appointmentService.walkIn({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            offsetMinutes: 0,
        });

        const [reminder] = await sql<{ status: string }[]>`
            SELECT status FROM reminders WHERE appointment_id = ${appointment.id}
        `;
        expect(reminder?.status).toBe('skipped');
    });

    test('an unknown branch rolls the whole walk-in back', async () => {
        await clinic();
        const before = await snapshot();

        await expect(
            appointmentService.walkIn({
                patient: { kind: 'new', name: 'Doomed Walk-up', phone: '01055555555' },
                branchId: Bun.randomUUIDv7(),
                offsetMinutes: 0,
            }),
        ).rejects.toThrow();

        expect(await snapshot()).toEqual(before);
    });
});

describe('visit.checkIn', () => {
    test('a refused check-in creates no visit and leaves the appointment booked', async () => {
        const fixtures = await clinic();
        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });
        await appointmentService.cancel(appointment.id);

        const before = await snapshot();

        await expectAppError(ERROR_CODE.INVALID_STATUS_TRANSITION, () =>
            visitService.checkIn({ appointmentId: appointment.id }),
        );

        expect(await snapshot()).toEqual(before);
        expect((await appointmentService.byId(appointment.id)).status).toBe('cancelled');
    });

    test('check-in writes the visit, the status and the checkup line together', async () => {
        const fixtures = await clinic();
        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });

        const before = await snapshot();
        await visitService.checkIn({ appointmentId: appointment.id });
        const after = await snapshot();

        // §8 — the visit and its seeded line arrive in the same transaction as
        // the status change, so no client ever sees a checked-in appointment
        // whose visit does not exist yet.
        expect(after.visits).toBe(before.visits + 1);
        expect(after.visitProcedures).toBe(before.visitProcedures + 1);
        expect((await appointmentService.byId(appointment.id)).status).toBe('checked_in');
    });

    test('an unknown appointment creates nothing', async () => {
        await clinic();
        const before = await snapshot();

        await expectAppError(ERROR_CODE.NOT_FOUND, () =>
            visitService.checkIn({ appointmentId: Bun.randomUUIDv7() }),
        );

        expect(await snapshot()).toEqual(before);
    });
});

describe('visit.setProcedures', () => {
    test('a rejected line leaves the existing lines untouched', async () => {
        // The whole list is replaced, so a failure partway through would be the
        // difference between the visit's old procedures and none at all.
        const fixtures = await clinic();
        const appointment = await appointmentService.create({
            patient: { kind: 'existing', patientId: fixtures.patient.id },
            branchId: fixtures.branch.id,
            startsAt: slot(),
            offsetMinutes: 0,
        });
        const visit = await visitService.checkIn({ appointmentId: appointment.id });

        await visitService.setProcedures({
            visitId: visit.id,
            procedures: [{ procedureId: fixtures.rootCanal.id, quantity: 1 }],
        });
        const before = await visitService.byId(visit.id);

        await expectAppError(ERROR_CODE.PROCEDURE_DUPLICATE, () =>
            visitService.setProcedures({
                visitId: visit.id,
                procedures: [
                    { procedureId: fixtures.xray.id, quantity: 2 },
                    { procedureId: fixtures.rootCanal.id, quantity: 1 },
                    { procedureId: fixtures.rootCanal.id, quantity: 1 },
                ],
            }),
        );

        const after = await visitService.byId(visit.id);
        expect(after.procedures.map((p) => p.procedureId)).toEqual(
            before.procedures.map((p) => p.procedureId),
        );
        expect(after.computedTotal).toBe(before.computedTotal);
    });
});
