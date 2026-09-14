import type { ClientRole, ProcedureRecorder } from '@lustre/shared';

/**
 * Whether this phone gets the procedure editor. The doctor always does. The
 * desk does only when the clinic says both record, and a server that has never
 * heard of the setting counts as doctor only — the narrower answer is the one
 * that cannot put a price in the wrong hands.
 */
export function canRecordProcedures(role: ClientRole, recorder: ProcedureRecorder | undefined): boolean {
    return role === 'doctor' || recorder === 'both';
}
