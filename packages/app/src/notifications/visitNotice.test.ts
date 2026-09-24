import { describe, expect, it } from 'bun:test';
import { WS_EVENT, WS_PROTOCOL_VERSION, type WsEvent } from '@lustre/shared';
import type { ServerEvent } from '../api/serverEvents';
import {
    arrivalIdentifier,
    arrivalToAnnounce,
    completionToAnnounce,
    NOTICE_MAX_AGE_MS,
    noticeIdentifier,
} from './visitNotice';

const NOW = 1_800_000_000_000;

function frame(
    event: WsEvent = WS_EVENT.VISIT_COMPLETED,
    at = NOW,
    id: string | null = 'appt-1',
): ServerEvent {
    return { v: WS_PROTOCOL_VERSION, type: 'event', epoch: 'e1', seq: 1, at, event, ...(id ? { id } : {}) };
}

describe('the completion notice', () => {
    it('is raised on the desk phone for a completion', () => {
        expect(completionToAnnounce(frame(), 'secretary', NOW)).toBe('appt-1');
    });

    it('is not raised on the doctor phone, which is the one that finished', () => {
        expect(completionToAnnounce(frame(), 'doctor', NOW)).toBeNull();
    });

    it('is raised for nothing but a completion', () => {
        for (const event of Object.values(WS_EVENT).filter((name) => name !== WS_EVENT.VISIT_COMPLETED)) {
            expect(completionToAnnounce(frame(event), 'secretary', NOW)).toBeNull();
        }
    });

    it('is withheld for a completion replayed long after the patient left', () => {
        expect(
            completionToAnnounce(frame(WS_EVENT.VISIT_COMPLETED, NOW - NOTICE_MAX_AGE_MS), 'secretary', NOW),
        ).toBe('appt-1');
        expect(
            completionToAnnounce(
                frame(WS_EVENT.VISIT_COMPLETED, NOW - NOTICE_MAX_AGE_MS - 1),
                'secretary',
                NOW,
            ),
        ).toBeNull();
    });

    it('needs an appointment to name', () => {
        expect(completionToAnnounce(frame(WS_EVENT.VISIT_COMPLETED, NOW, null), 'secretary', NOW)).toBeNull();
    });

    it('is posted under one identifier per appointment, so a repeat replaces rather than stacks', () => {
        expect(noticeIdentifier('appt-1')).toBe(noticeIdentifier('appt-1'));
        expect(noticeIdentifier('appt-1')).not.toBe(noticeIdentifier('appt-2'));
    });
});

describe('the arrival notice', () => {
    const arrival = (at = NOW, id: string | null = 'appt-1') =>
        frame(WS_EVENT.APPOINTMENT_CHECKED_IN, at, id);

    it('is raised on the doctor phone for a check-in', () => {
        expect(arrivalToAnnounce(arrival(), 'doctor', NOW)).toBe('appt-1');
    });

    it('is not raised on the desk phone, which is the one that checked them in', () => {
        expect(arrivalToAnnounce(arrival(), 'secretary', NOW)).toBeNull();
    });

    it('is raised for nothing but a check-in', () => {
        for (const event of Object.values(WS_EVENT).filter(
            (name) => name !== WS_EVENT.APPOINTMENT_CHECKED_IN,
        )) {
            expect(arrivalToAnnounce(frame(event), 'doctor', NOW)).toBeNull();
        }
    });

    it('is withheld for a check-in replayed long after, and needs an appointment', () => {
        expect(arrivalToAnnounce(arrival(NOW - NOTICE_MAX_AGE_MS - 1), 'doctor', NOW)).toBeNull();
        expect(arrivalToAnnounce(arrival(NOW, null), 'doctor', NOW)).toBeNull();
    });

    it('does not share an identifier with the completion notice', () => {
        expect(arrivalIdentifier('appt-1')).not.toBe(noticeIdentifier('appt-1'));
    });
});
