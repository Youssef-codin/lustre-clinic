/**
 * The demo backend is the app's server when there is no server, so what is
 * tested here is that it *is one*: that seeding produces a clinic in a state
 * the real one could actually be in, and that the flow a demo walks through —
 * book, check in, take the money — leaves the same rows behind that
 * `packages/server` would.
 *
 * The states that mean "right now" get the most attention, because they are
 * the ones a seed can quietly invent: two patients in the chair at once, a
 * queue nobody is at the front of, a bar measuring from the wrong stamp. Those
 * are the failures that only show up in front of an audience.
 *
 * AsyncStorage is a native module and there is no device under `bun test`, so
 * it is mocked to nothing — persistence is the one part of `db.ts` this cannot
 * reach.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test';

mock.module('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: () => Promise.resolve(null),
        setItem: () => Promise.resolve(),
        removeItem: () => Promise.resolve(),
        multiGet: () => Promise.resolve([]),
        multiSet: () => Promise.resolve(),
    },
}));

const { getDb, setDb } = await import('./db');
const { seedDemoDb } = await import('./seed');
const { appointmentHandlers } = await import('./handlers/appointment');
const { visitHandlers } = await import('./handlers/visit');
const { balanceHandlers } = await import('./handlers/balance');
const { branchHandlers } = await import('./handlers/branch');
const { patientHandlers } = await import('./handlers/patient');
const { procedureHandlers } = await import('./handlers/procedure');
const { settingsHandlers } = await import('./handlers/settings');
const { reminderHandlers } = await import('./handlers/reminder');
const { statsHandlers } = await import('./handlers/stats');
const { resolve, hasHandler } = await import('./handlers');
const { DemoError } = await import('./rules');

function today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** The offset the app sends: minutes east of UTC for the day being asked about. */
function offsetMinutes(): number {
    return -new Date().getTimezoneOffset();
}

beforeEach(() => {
    setDb(seedDemoDb());
});

describe('the seeded day', () => {
    it('opens on a clinic that is open right now', () => {
        const schedule = settingsHandlers.schedule();
        expect(schedule).toHaveLength(7);

        const day = schedule.find((row) => row.weekday === new Date().getDay());
        if (!day) throw new Error('the seed left today closed');

        const now = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
        // Zero-padded `HH:MM`, so a string comparison orders them by time.
        expect(day.opensAt <= now).toBe(true);
        expect(day.closesAt >= now).toBe(true);
    });

    /**
     * The branch, not just the row. `clinic_days.weekday` is the primary key, so
     * one weekday names one branch, and the day view opens on the first branch
     * in the register — assigning today to the other one is a demo that opens on
     * "Closed on Tuesdays" with its whole day filed under "booked anyway". The
     * original check only asserted a row existed for today, which that bug
     * passed.
     */
    it('holds today at the branch the day view opens on', () => {
        const db = getDb();
        const opensOn = branchHandlers.list({ includeInactive: false })[0];
        if (!opensOn) throw new Error('the seed registered no branches');

        const day = settingsHandlers.schedule().find((row) => row.weekday === new Date().getDay());
        expect(day?.branchId).toBe(opensOn.id);

        // And the day's own appointments are at that branch, or they draw as
        // booked on a day the clinic is somewhere else.
        const appointments = appointmentHandlers.byDate({
            date: today(),
            offsetMinutes: offsetMinutes(),
        });

        expect(appointments.length).toBeGreaterThan(0);
        expect(appointments.every((row) => row.branchId === opensOn.id)).toBe(true);
    });

    /**
     * The demo was seeded on a five-minute grid, so it booked people at 10:25
     * and 11:35 — legal, but nothing like a clinic's book, and the first thing
     * anyone sees. Every seeded start now lands on a ten.
     *
     * The whole table, not just today's: the same grid draws the fortnight of
     * history behind the day view and the week ahead of it, and the opening
     * balance is the row that was written by hand and forgot.
     */
    it('books every appointment on a ten-minute boundary', () => {
        const offGrid = getDb()
            .appointments.filter((row) => row.startsAt.getMinutes() % 10 !== 0)
            .map((row) => row.startsAt.toString());

        expect(offGrid).toEqual([]);
    });

    // The picker steps from opening, so an open on a :45 puts every slot it
    // offers back on a five however tidy the seeded rows are.
    it('opens and closes the clinic on the same boundary', () => {
        for (const day of settingsHandlers.schedule()) {
            expect(Number(day.opensAt.slice(3)) % 10).toBe(0);
            expect(Number(day.closesAt.slice(3)) % 10).toBe(0);
        }
    });

    it('puts exactly one patient in the chair', () => {
        const db = getDb();

        const seated = db.visits.filter((visit) => {
            if (!visit.inChairAt) return false;
            const appointment = db.appointments.find((row) => row.id === visit.appointmentId);
            return appointment?.status === 'checked_in';
        });

        expect(seated).toHaveLength(1);
    });

    it('leaves a queue behind the chair, and nobody in it seated', () => {
        const db = getDb();

        const waiting = db.visits.filter((visit) => {
            const appointment = db.appointments.find((row) => row.id === visit.appointmentId);
            return appointment?.status === 'checked_in' && visit.inChairAt === null;
        });

        expect(waiting.length).toBeGreaterThan(0);
    });

    it('has someone at the desk, whose chair time is behind them', () => {
        const db = getDb();

        const atDesk = db.appointments.filter((row) => row.status === 'awaiting_payment');
        expect(atDesk).toHaveLength(1);

        const visit = db.visits.find((row) => row.appointmentId === atDesk[0]?.id);
        // They were in the chair before they went to the desk, so the stamp is
        // set and it is in the past — the case a hand-written row gets wrong.
        expect(visit?.inChairAt).toBeInstanceOf(Date);
        expect(visit?.inChairAt?.getTime()).toBeLessThan(Date.now());
    });

    it('gives every checked-in visit the procedures its booking planned', () => {
        const db = getDb();

        for (const visit of db.visits) {
            const planned = db.appointmentProcedures.filter(
                (line) => line.appointmentId === visit.appointmentId,
            );
            if (planned.length === 0) continue;

            const performed = db.visitProcedures.filter((line) => line.visitId === visit.id);
            expect(performed.length).toBeGreaterThanOrEqual(planned.length);
        }
    });

    it('draws a day, a register, a catalogue and money', () => {
        expect(
            appointmentHandlers.byDate({ date: today(), offsetMinutes: offsetMinutes() }).length,
        ).toBeGreaterThan(3);
        expect(patientHandlers.recent({ limit: 25 }).total).toBeGreaterThan(10);
        expect(procedureHandlers.tree({ includeInactive: false }).length).toBeGreaterThan(4);
        expect(balanceHandlers.outstanding().total).toBeGreaterThan(0);
        expect(
            reminderHandlers.pending({ dueOnly: true, limit: 100, offsetMinutes: 0 }).length,
        ).toBeGreaterThan(0);
    });

    it('keeps opening balances out of the day and inside what is owed', () => {
        const db = getDb();
        const carried = db.appointments.filter((row) => row.isOpeningBalance);
        expect(carried.length).toBeGreaterThan(0);

        const day = appointmentHandlers.byDate({ date: today(), offsetMinutes: offsetMinutes() });
        expect(day.some((row) => row.isOpeningBalance)).toBe(false);

        const owed = balanceHandlers.outstanding();
        const carriedPatients = new Set(carried.map((row) => row.patientId));
        expect(owed.patients.some((row) => carriedPatients.has(row.patientId))).toBe(true);
    });
});

describe('a visit, end to end', () => {
    it('books, checks in, prices and settles', () => {
        const db = getDb();
        const branch = db.branches[0];
        const patient = db.patients[3];
        const cleaning = db.procedureTypes.find((row) => row.name === 'Scaling & polishing');
        if (!branch || !patient || !cleaning) throw new Error('the seed is missing its fixtures');

        // Past the six days the seed books ahead, so this cannot land on one of
        // its slots and be refused for a reason the test is not about.
        const startsAt = new Date(Date.now() + 9 * 24 * 3_600_000);

        const appointment = appointmentHandlers.create({
            patient: { kind: 'existing', patientId: patient.id },
            branchId: branch.id,
            startsAt: startsAt.toISOString(),
            durationMinutes: 30,
            procedures: [{ procedureId: cleaning.id, quantity: 1 }],
            offsetMinutes: 0,
        });

        expect(appointment.status).toBe('booked');
        expect(appointment.ref).toMatch(/^\d{6}-[A-Z0-9]{4}$/);

        const visit = visitHandlers.checkIn({ appointmentId: appointment.id });
        const detail = visitHandlers.byId({ id: visit.id });

        // The cleaning, plus the checkup line check-in seeds — and the checkup
        // is waived because other work was done.
        expect(detail.procedures).toHaveLength(2);
        expect(detail.chargedTotal).toBe(cleaning.defaultPrice);

        const closed = visitHandlers.checkOut({
            visitId: visit.id,
            chargedTotal: cleaning.defaultPrice,
            paidTotal: 20_000,
            method: 'cash',
        });

        expect(closed.completedAt).toBeInstanceOf(Date);
        expect(closed.balance).toBe(cleaning.defaultPrice - 20_000);

        const settled = balanceHandlers.settle({
            patientId: patient.id,
            amount: closed.balance,
            method: 'visa',
        });

        expect(settled.outstandingAfter).toBe(0);
        expect(visitHandlers.byId({ id: visit.id }).balance).toBe(0);
    });

    it('empties the chair into the longest wait when the patient goes to the desk', () => {
        const db = getDb();

        const seatedBefore = db.visits.find((visit) => {
            const appointment = db.appointments.find((row) => row.id === visit.appointmentId);
            return visit.inChairAt !== null && appointment?.status === 'checked_in';
        });
        if (!seatedBefore) throw new Error('the seed put nobody in the chair');

        const waiting = db.visits
            .filter((visit) => {
                const appointment = db.appointments.find((row) => row.id === visit.appointmentId);
                return visit.inChairAt === null && appointment?.status === 'checked_in';
            })
            .sort((a, b) => a.checkedInAt.getTime() - b.checkedInAt.getTime());

        const next = waiting[0];
        if (!next) throw new Error('the seed left nobody waiting');

        appointmentHandlers.awaitPayment({ id: seatedBefore.appointmentId });

        // The one who had been waiting longest is now the one in the chair, and
        // their bar starts here rather than at the time they arrived.
        expect(next.inChairAt).toBeInstanceOf(Date);
        expect(next.inChairAt?.getTime()).toBeGreaterThan(next.checkedInAt.getTime());
    });
});

describe('the refusals a demo runs into', () => {
    it('refuses a double booking with SLOT_OVERLAP', () => {
        const db = getDb();
        const branch = db.branches[0];
        const patient = db.patients[1];
        if (!branch || !patient) throw new Error('the seed is missing its fixtures');

        const startsAt = new Date(Date.now() + 10 * 24 * 3_600_000).toISOString();
        const book = () =>
            appointmentHandlers.create({
                patient: { kind: 'existing', patientId: patient.id },
                branchId: branch.id,
                startsAt,
                durationMinutes: 30,
                offsetMinutes: 0,
            });

        book();
        expect(book).toThrow(DemoError);

        try {
            book();
        } catch (error) {
            expect((error as InstanceType<typeof DemoError>).code).toBe('SLOT_OVERLAP');
        }
    });

    it('refuses a payment larger than the balance', () => {
        const owing = balanceHandlers.outstanding().patients[0];
        if (!owing) throw new Error('the seed left nobody owing');

        expect(() =>
            balanceHandlers.settle({
                patientId: owing.patientId,
                amount: owing.balance + 1,
                method: 'cash',
            }),
        ).toThrow('a payment may not exceed what the patient owes');
    });

    it('refuses a tooth on a procedure that is not done on one', () => {
        const db = getDb();
        const cleaning = db.procedureTypes.find((row) => row.name === 'Scaling & polishing');
        // An open visit: a closed one is refused earlier, for a different reason.
        const visit = db.visits.find((row) => row.completedAt === null);
        if (!cleaning || !visit) throw new Error('the seed is missing its fixtures');

        expect(() =>
            visitHandlers.setProcedures({
                visitId: visit.id,
                procedures: [{ procedureId: cleaning.id, quantity: 1, tooth: 'UL6' }],
            }),
        ).toThrow('that procedure is not done on a specific tooth');
    });
});

describe('the dispatch table', () => {
    it('answers every procedure the app can call', () => {
        // A spot check that the table is wired to real functions rather than a
        // shape that merely typechecks.
        expect(hasHandler('appointment.byDate')).toBe(true);
        expect(hasHandler('visit.checkOut')).toBe(true);
        expect(hasHandler('nope.missing')).toBe(false);

        const report = resolve('stats.summary', {
            from: today(),
            to: today(),
            offsetMinutes: offsetMinutes(),
        });

        expect(report).toMatchObject({ appointments: { total: expect.any(Number) } });
    });

    it('reports the day the stats screen asks for', () => {
        const summary = statsHandlers.summary({
            from: today(),
            to: today(),
            offsetMinutes: offsetMinutes(),
        });

        expect(summary.appointments.total).toBeGreaterThan(0);
        expect(summary.visits.outstanding).toBeGreaterThan(0);
    });
});
