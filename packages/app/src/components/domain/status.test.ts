/**
 * The appointment sheet once called a queued patient "In the chair" while the day
 * view called them Waiting. The fix is this label choice, so it is tested here.
 */
import { describe, expect, it } from 'bun:test';
import type { AppointmentStatus } from '@lustre/shared';
import { statusLabel, statusTone } from './status';

describe('status label', () => {
    it('reads In the chair only for the patient seated', () => {
        expect(statusLabel('checked_in', true)).toBe('In the chair');
        expect(statusTone('checked_in', true)).toBe('accent');
    });

    it('reads Waiting for a patient checked in behind the chair', () => {
        expect(statusLabel('checked_in', false)).toBe('Waiting');
        expect(statusTone('checked_in', false)).toBe('due');
    });

    it('leaves every other status alone whatever the queue says', () => {
        const others: AppointmentStatus[] = ['booked', 'awaiting_payment', 'done', 'cancelled', 'no_show'];
        for (const status of others) {
            expect(statusLabel(status, false)).toBe(statusLabel(status, true));
            expect(statusTone(status, false)).toBe(statusTone(status, true));
        }
        expect(statusLabel('awaiting_payment', false)).toBe('At the desk');
    });
});
