/**
 * Who may call what, and what they are shown — the server's procedure kinds
 * (`server/src/trpc/init.ts`) and its `viewer` arguments, applied here in one
 * place rather than in every handler. The lists below are the server's routers
 * read off by kind, and have to be changed with them.
 */
import { ERROR_CODE, seesPayments, viewOf } from '@lustre/shared';
import { authorizeDemo, type DemoCaller } from './handlers/device';
import { DemoError } from './rules';

/** `publicProcedure`: reachable by a phone the server does not let in. */
const PUBLIC = new Set(['health.check', 'health.clock', 'release.latestApk', 'device.me', 'device.redeem']);

/** `paymentProcedure`: refused to a doctor. */
const PAYMENT = new Set([
    'balance.outstanding',
    'balance.byPatient',
    'balance.settle',
    'balance.summary',
    'balance.takings',
    'stats.summary',
    'visit.recordPayment',
    'visit.setPaid',
    'visit.deletePayment',
]);

/** `adminProcedure`. */
const ADMIN = new Set(['device.grants', 'device.issue', 'device.revoke', 'device.setRequireProvisioning']);

/** Procedures that answer with a whole visit, whose payment fields a doctor is not shown. */
const VISIT_ANSWERS = new Set([
    'visit.byId',
    'visit.byAppointment',
    'visit.setProcedures',
    'visit.setPrice',
    'visit.checkOut',
    'visit.reopen',
]);

function forbidden(what: string): DemoError {
    return new DemoError(ERROR_CODE.ROLE_FORBIDDEN, `this role may not ${what}`, 403);
}

/** The caller behind `token`, or the refusal the server would send for `path`. */
export function admit(path: string, token: string | null): DemoCaller {
    if (PUBLIC.has(path)) return { token, deviceId: null, role: null };
    const caller = authorizeDemo(token);
    if (PAYMENT.has(path) && !seesPayments(caller.role)) throw forbidden('see payments');
    if (ADMIN.has(path) && caller.role !== 'admin') throw forbidden('manage roles');
    return caller;
}

/** A provisioned phone edits a ref as its credential's view, whatever it claims (`patientService.updateRef`). */
export function inputFor(path: string, input: unknown, caller: DemoCaller): unknown {
    if (path !== 'patient.updateRef' || !caller.role || !input || typeof input !== 'object') return input;
    return { ...input, editedBy: viewOf(caller.role) };
}

function withheld<T extends object>(row: T, fields: readonly string[]): T {
    return { ...row, ...Object.fromEntries(fields.map((field) => [field, null])) };
}

/** What `path` answered, less what the caller's role may not see. */
export function shownTo(path: string, output: unknown, caller: DemoCaller): unknown {
    if (seesPayments(caller.role) || !output || typeof output !== 'object') return output;
    if (VISIT_ANSWERS.has(path)) return withheld(output, ['payments', 'paidTotal', 'balance']);
    if (path === 'patient.byId') {
        const detail = output as { history: object[] };
        return {
            ...detail,
            history: detail.history.map((entry) => withheld(entry, ['paidTotal', 'balance'])),
        };
    }
    return output;
}
