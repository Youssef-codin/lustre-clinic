import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { ERROR_CODE } from '@mawid/shared';
import type { AppError } from '../src/errors/AppError.ts';
import {
    cancelAppointment,
    createAppointment,
    updateAppointment,
} from '../src/modules/appointment/appointment.service.ts';
import { searchPatients } from '../src/modules/patient/patient.service.ts';
import { atMonday, loadTestConfig } from './helpers/app.ts';
import { closeTestDb, openTestDb, resetDb } from './helpers/db.ts';

/**
 * Double-booking is the one hard correctness guarantee in the system (spec §5),
 * so it gets its own suite covering every boundary of the interval comparison
 * rather than being tested incidentally through the HTTP layer.
 *
 * Durations come from `config.example.json`:
 *   checkup 20 · cleaning 30 · filling 45 · rootcanal 90
 *
 * The fixture booking is a 30-minute cleaning at 08:00Z, so it occupies
 * [08:00, 08:30).
 */

let counter = 0;

function book(startsAt: string, typeId = 'cleaning') {
    counter += 1;
    return createAppointment({
        patient: { name: `Patient ${counter}`, phone: `0101000${String(counter).padStart(4, '0')}` },
        startsAt,
        typeId,
    });
}

function errorFrom(fn: () => unknown): AppError {
    try {
        fn();
    } catch (err) {
        return err as AppError;
    }
    throw new Error('expected the booking to be rejected, but it succeeded');
}

beforeAll(() => {
    loadTestConfig();
    openTestDb();
});

afterAll(() => {
    closeTestDb();
});

beforeEach(() => {
    resetDb();
    counter = 0;
    book(atMonday('08:00')); // the appointment every case below is compared against
});

describe('the overlap check — boundaries', () => {
    test('exactly the same start is taken', () => {
        const err = errorFrom(() => book(atMonday('08:00')));
        expect(err.status).toBe(409);
        expect(err.code).toBe(ERROR_CODE.SLOT_TAKEN);
    });

    test('starting exactly when the previous one ends is free', () => {
        expect(book(atMonday('08:30')).startsAt).toBe(atMonday('08:30'));
    });

    test('ending exactly when the next one begins is free', () => {
        // 07:30 + 30min = 08:00, the moment the fixture starts.
        expect(book(atMonday('07:30')).startsAt).toBe(atMonday('07:30'));
    });

    test('fully contained inside an existing appointment is taken', () => {
        // a 20-minute checkup at 08:05 sits entirely within [08:00, 08:30)
        expect(errorFrom(() => book(atMonday('08:05'), 'checkup')).code).toBe(ERROR_CODE.SLOT_TAKEN);
    });

    test('spanning an existing appointment is taken', () => {
        // a 90-minute root canal at 07:30 swallows [08:00, 08:30) whole
        expect(errorFrom(() => book(atMonday('07:30'), 'rootcanal')).code).toBe(ERROR_CODE.SLOT_TAKEN);
    });

    test('overlapping only the head is taken', () => {
        // 07:45 + 20min = 08:05 — crosses the fixture's start
        expect(errorFrom(() => book(atMonday('07:45'), 'checkup')).code).toBe(ERROR_CODE.SLOT_TAKEN);
    });

    test('overlapping only the tail is taken', () => {
        // 08:20 + 20min = 08:40 — crosses the fixture's end
        expect(errorFrom(() => book(atMonday('08:20'), 'checkup')).code).toBe(ERROR_CODE.SLOT_TAKEN);
    });

    test('a whole day can be filled back to back', () => {
        expect(book(atMonday('08:30')).id).toBeGreaterThan(0);
        expect(book(atMonday('09:00')).id).toBeGreaterThan(0);
        expect(book(atMonday('09:30')).id).toBeGreaterThan(0);
        expect(errorFrom(() => book(atMonday('09:15'), 'checkup')).code).toBe(ERROR_CODE.SLOT_TAKEN);
    });
});

describe('the overlap check — which appointments count', () => {
    test('a cancelled appointment frees its slot', () => {
        const taken = errorFrom(() => book(atMonday('08:00')));
        expect(taken.code).toBe(ERROR_CODE.SLOT_TAKEN);

        const existing = book(atMonday('08:30'));
        cancelAppointment(existing.id);

        expect(book(atMonday('08:30')).id).toBeGreaterThan(0);
    });

    test('a no-show does not hold the slot open either', () => {
        const existing = book(atMonday('09:00'));
        updateAppointment(existing.id, { status: 'no_show' });

        expect(book(atMonday('09:00')).id).toBeGreaterThan(0);
    });
});

describe('the overlap check — moving an appointment', () => {
    test('an appointment does not collide with itself when it stays put', () => {
        const existing = book(atMonday('09:00'));
        expect(updateAppointment(existing.id, { note: 'moved nothing' }).startsAt).toBe(atMonday('09:00'));
    });

    test('moving onto a taken slot is rejected', () => {
        const existing = book(atMonday('09:00'));
        const err = errorFrom(() => updateAppointment(existing.id, { startsAt: atMonday('08:15') }));
        expect(err.code).toBe(ERROR_CODE.SLOT_TAKEN);
    });

    test('moving onto a free slot succeeds', () => {
        const existing = book(atMonday('09:00'));
        expect(updateAppointment(existing.id, { startsAt: atMonday('10:00') }).startsAt).toBe(
            atMonday('10:00'),
        );
    });

    test('growing an appointment into its neighbour is rejected', () => {
        // 08:30 cleaning ends 09:00; the neighbour starts 09:00. Switching it to
        // a 90-minute root canal would run to 10:00 and swallow the neighbour.
        const growing = book(atMonday('08:30'));
        book(atMonday('09:00'));

        expect(errorFrom(() => updateAppointment(growing.id, { typeId: 'rootcanal' })).code).toBe(
            ERROR_CODE.SLOT_TAKEN,
        );
    });

    test('un-cancelling into a slot taken meanwhile is rejected', () => {
        const existing = book(atMonday('09:00'));
        cancelAppointment(existing.id);
        book(atMonday('09:00'));

        expect(errorFrom(() => updateAppointment(existing.id, { status: 'booked' })).code).toBe(
            ERROR_CODE.SLOT_TAKEN,
        );
    });
});

describe('appointment refs', () => {
    test('number sequentially within a clinic day', () => {
        expect(book(atMonday('08:30')).ref).toBe('030826-02');
        expect(book(atMonday('09:00')).ref).toBe('030826-03');
    });

    test('restart at 01 on a different day', () => {
        // Tuesday 2026-08-04, 10:00 Cairo
        expect(
            createAppointment({
                patient: { name: 'Next Day', phone: '01088888888' },
                startsAt: '2026-08-04T07:00:00.000Z',
                typeId: 'cleaning',
            }).ref,
        ).toBe('040826-01');
    });

    test('a cancelled booking does not hand its number to the next one', () => {
        const second = book(atMonday('08:30'));
        expect(second.ref).toBe('030826-02');

        cancelAppointment(second.id);
        expect(book(atMonday('09:00')).ref).toBe('030826-03');
    });

    test('the last appointment of the day still carries that day’s date', () => {
        // 20:30 Cairo, the latest a 30-minute cleaning fits before the 21:00 close.
        const late = createAppointment({
            patient: { name: 'Late Night', phone: '01077777777' },
            startsAt: atMonday('17:30'),
            typeId: 'cleaning',
        });
        expect(late.ref.startsWith('030826-')).toBe(true);
    });

    test('a moved appointment keeps the ref already printed on its slip', () => {
        const appointment = book(atMonday('08:30'));
        const moved = updateAppointment(appointment.id, { startsAt: '2026-08-04T07:00:00.000Z' });

        expect(moved.ref).toBe(appointment.ref);
    });
});

describe('booking is all-or-nothing', () => {
    test('a rejected walk-in booking leaves no patient behind', () => {
        const before = book(atMonday('09:00'));
        expect(before.id).toBeGreaterThan(0);

        const err = errorFrom(() =>
            createAppointment({
                patient: { name: 'Never Created', phone: '01099999999' },
                startsAt: atMonday('09:00'),
                typeId: 'cleaning',
            }),
        );
        expect(err.code).toBe(ERROR_CODE.SLOT_TAKEN);

        expect(searchPatients('Never Created', 10)).toHaveLength(0);
    });
});
