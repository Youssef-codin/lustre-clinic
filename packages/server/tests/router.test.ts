import { describe, expect, test } from 'bun:test';
import { appRouter } from '../src/trpc/router.ts';

/**
 * SPEC §13 lists the API surface. This asserts the router tree matches it, so
 * a module that is built but never merged into `appRouter` fails here rather
 * than when the app tries to call it.
 */

const EXPECTED = [
    'health.check',
    'settings.get',
    'settings.update',
    'branch.list',
    'branch.create',
    'branch.update',
    'procedure.tree',
    'procedure.create',
    'procedure.update',
    'patient.search',
    'patient.byId',
    'patient.create',
    'patient.update',
    'customQuestion.list',
    'customQuestion.create',
    'customQuestion.update',
    'appointment.byDate',
    'appointment.byId',
    'appointment.missed',
    'appointment.create',
    'appointment.walkIn',
    'appointment.update',
    'appointment.cancel',
    'visit.checkIn',
    'visit.byId',
    'visit.setProcedures',
    'visit.setPrice',
    'visit.checkOut',
    'visit.recordPayment',
    'balance.outstanding',
    'balance.byPatient',
    'balance.summary',
    'reminder.pending',
    'reminder.markSent',
    'reminder.markSkipped',
    'reminder.dismissToday',
    'stats.summary',
];

describe('appRouter', () => {
    const paths = Object.keys(appRouter._def.procedures);

    test.each(EXPECTED)('exposes %s', (path) => {
        expect(paths).toContain(path);
    });
});
