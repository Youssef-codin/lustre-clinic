/**
 * Failures, in the words the secretary needs. §4/§14: the client localizes
 * from `ERROR_CODE` and never parses the server's message, which stays English
 * for the logs; when the dictionaries land (F4) these strings move into them
 * and the switch does not change. The rule for the copy: say what happened to
 * the thing on screen, then what to do about it. The SLOT_OVERLAP case matters
 * most — double-booking is a Postgres exclusion constraint, and a secretary
 * standing in front of the patient has to know the slot is gone, not that
 * "something went wrong", or she tells them they are booked and they are not.
 */
import { ERROR_CODE } from '@mawid/shared';
import type { RequestError } from './data';

export interface ErrorMessage {
    title: string;
    body?: string;
}

export type ErrorContext = 'walk-in' | 'move' | 'check-in' | 'check-out' | 'day' | 'generic';

export function describeError(error: RequestError, context: ErrorContext = 'generic'): ErrorMessage {
    if (error.offline) {
        return {
            title: 'The clinic server did not answer',
            body: 'Nothing was saved. Check the clinic PC is on and try again.',
        };
    }

    switch (error.code) {
        case ERROR_CODE.SLOT_OVERLAP:
            return {
                title: 'That slot is taken',
                body:
                    context === 'walk-in'
                        ? 'Someone is already booked for that time. Give this walk-in a shorter visit, or finish the patient in the chair first.'
                        : 'Someone is already booked for that time. Pick another time, or shorten the appointment.',
            };

        case ERROR_CODE.INVALID_DURATION:
            return {
                title: 'That length is not one of the clinic’s',
                body: 'Pick one of the durations set up in Settings.',
            };

        case ERROR_CODE.INVALID_STATUS_TRANSITION:
            return {
                title: 'That has already moved on',
                body: 'Someone else changed this appointment. Close this and open it again.',
            };

        case ERROR_CODE.VISIT_ALREADY_EXISTS:
            return { title: 'This patient is already checked in' };

        case ERROR_CODE.VISIT_ALREADY_COMPLETED:
            return { title: 'This visit is already checked out' };

        case ERROR_CODE.NOT_FOUND:
            return {
                title: context === 'day' ? 'That day could not be loaded' : 'That is no longer there',
                body: 'It may have been cancelled or removed. Reload the day.',
            };

        case ERROR_CODE.INVALID_PHONE:
            return {
                title: 'That phone number does not look right',
                body: 'Use the number as it is dialled, for example 010 1234 5678.',
            };

        case ERROR_CODE.VALIDATION:
            return { title: 'Something in that was not accepted', body: 'Check the details and try again.' };

        case ERROR_CODE.INVALID_AMOUNT:
            return { title: 'That amount is not allowed', body: 'Enter the amount in whole pounds.' };

        case ERROR_CODE.PAYMENT_NOTE_REQUIRED:
            return {
                title: 'Say how they paid',
                body: 'Other needs a note — Instapay to whom, or which card.',
            };

        case ERROR_CODE.DB_UNAVAILABLE:
            return {
                title: 'The clinic server is not answering',
                body: 'Nothing was saved. Try again in a moment.',
            };

        default:
            return {
                title: writeContext(context) ? 'That did not save' : 'That did not load',
                body: 'Nothing was changed. Try again — if it keeps failing, the clinic PC may need a restart.',
            };
    }
}

function writeContext(context: ErrorContext): boolean {
    return context !== 'day' && context !== 'generic';
}
