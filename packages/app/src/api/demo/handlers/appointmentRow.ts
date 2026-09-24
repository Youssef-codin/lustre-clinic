/**
 * Writing an `appointments` row, and nothing else.
 *
 * It is its own module because two handlers need it and one of them is
 * `migration`, which `patient` calls — and `appointment` calls `patient` back
 * for a booking that registers someone. Left where it was, that closed a
 * require cycle (`appointment → patient → migration → appointment`) which Metro
 * warns about and which can hand a module an uninitialised binding. The server
 * has the same triangle and breaks it with a lazy import; here the shared piece
 * is small and depends on nothing, so lifting it out is the honest fix.
 */
import { type AppointmentRow, getDb } from '../db';
import { buildRef, uuidv7 } from '../rules';

export function insertAppointment(
    values: Omit<AppointmentRow, 'id' | 'ref' | 'labStatus' | 'createdAt' | 'updatedAt'> &
        Partial<Pick<AppointmentRow, 'labStatus'>>,
    offsetMinutes: number,
): AppointmentRow {
    const now = new Date();
    const row: AppointmentRow = {
        labStatus: null,
        ...values,
        id: uuidv7(),
        ref: buildRef(values.startsAt, offsetMinutes),
        createdAt: now,
        updatedAt: now,
    };

    getDb().appointments.push(row);
    return row;
}
