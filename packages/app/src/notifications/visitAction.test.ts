import { describe, expect, it } from 'bun:test';
import { type AppointmentStatus, ERROR_CODE } from '@lustre/shared';
import type { Appointment } from '../screens/day/data/types';
import { chairToFinish, failureIdentifier, finishFailure, firstName } from './visitAction';

const at = (id: string, status: AppointmentStatus, updatedAt: string, branchId = 'b1'): Appointment =>
    ({
        id,
        branchId,
        status,
        startsAt: '2026-08-10T09:00:00+03:00',
        updatedAt,
        durationMinutes: 30,
        patient: { id: `p-${id}`, name: id, phone: '' },
    }) as Appointment;

describe('the visit the Finish action ends', () => {
    it('is whoever arrived first of those checked in', () => {
        const day = [
            at('later', 'checked_in', '2026-08-10T09:10:00Z'),
            at('first', 'checked_in', '2026-08-10T09:00:00Z'),
            at('booked', 'booked', '2026-08-10T08:00:00Z'),
        ];
        expect(chairToFinish(day)?.id).toBe('first');
    });

    it('orders by check-in time when it is known, as the doctor screen does', () => {
        const day = [
            at('a', 'checked_in', '2026-08-10T09:00:00Z'),
            at('b', 'checked_in', '2026-08-10T09:10:00Z'),
        ];
        const checkedInAt = new Map([
            ['a', '2026-08-10T08:50:00Z'],
            ['b', '2026-08-10T08:40:00Z'],
        ]);
        expect(chairToFinish(day, checkedInAt)?.id).toBe('b');
    });

    it('is nobody once the chair has gone to the desk', () => {
        const day = [at('paid', 'done', '1'), at('desk', 'awaiting_payment', '2'), at('next', 'booked', '3')];
        expect(chairToFinish(day)).toBeNull();
    });

    it('is on the branch holding most of the day, and on the other when that chair is empty', () => {
        const busy = [
            at('busy-chair', 'checked_in', '2026-08-10T09:05:00Z', 'b1'),
            at('busy-2', 'booked', '1', 'b1'),
            at('busy-3', 'booked', '1', 'b1'),
        ];
        const quiet = [at('quiet-chair', 'checked_in', '2026-08-10T09:00:00Z', 'b2')];
        expect(chairToFinish([...quiet, ...busy])?.id).toBe('busy-chair');
        expect(chairToFinish([...quiet, ...busy.slice(1)])?.id).toBe('quiet-chair');
    });
});

describe('the patient on the notice', () => {
    it('is named by first name only', () => {
        expect(firstName('  Mariam Adel Hassan ')).toBe('Mariam');
        expect(firstName('Omar')).toBe('Omar');
    });
});

describe('a Finish that did not go through', () => {
    it('is not reported when the visit had already left the chair', () => {
        expect(finishFailure({ code: ERROR_CODE.INVALID_STATUS_TRANSITION, offline: false })).toBe('gone');
        expect(finishFailure({ code: ERROR_CODE.NOT_FOUND, offline: false })).toBe('gone');
    });

    it('is reported as offline or as failed otherwise', () => {
        expect(finishFailure({ code: ERROR_CODE.INTERNAL, offline: true })).toBe('offline');
        expect(finishFailure({ code: ERROR_CODE.INTERNAL, offline: false })).toBe('failed');
    });

    it('is reported once per visit', () => {
        expect(failureIdentifier('a1')).toBe(failureIdentifier('a1'));
        expect(failureIdentifier('a1')).not.toBe(failureIdentifier('a2'));
    });
});
