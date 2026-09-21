/**
 * Giving a migrated patient back the number on their paper file.
 *
 * The old Settings → Data entry flow wrote the typed old number to `legacy_ref`
 * and then allocated a fresh `ref` off the counter anyway — so a patient whose
 * file says **710** went on file as **909**, with 710 stored but never drawn.
 * Registration does not do that any more: an old patient's `ref` *is* their old
 * number. This repairs the rows written before that was true.
 *
 * It lives here rather than in `0011_patient_ref_next.sql` deliberately. A
 * migration runs unattended on boot, and this one cannot always succeed — an
 * old number may already be another patient's ref — so it would have to either
 * fail the boot or skip silently. Neither is a thing to do to a clinic's
 * register. `scripts/repair-patient-refs.ts` reports first and writes only when
 * told to (`bun db:repair-refs --apply`).
 *
 * What it will not touch, and why each is left for a person:
 *
 * - A patient whose old number is already someone else's `ref`. Two files
 *   carrying one number is a fact about the paper, and only the desk knows
 *   which of the two records is which patient.
 * - An old number at or above `settings.patient_ref_next`. Taking it would hand
 *   the same number to a future new patient; raise the next number in
 *   Settings → Clinic first, then run this again.
 *
 * It is not a tRPC procedure. A one-off correction of a whole register is not
 * something to put behind a tap on a phone, and the two verdicts above need a
 * person reading a report, not a toast.
 *
 * It is safe to run twice, and occasionally wants to be. Records form chains —
 * one record's old number is another's current ref — and a chain is repaired in
 * one pass only when the rows happen to be walked in the order that frees each
 * number in turn. Anything reported `taken` that is really a chain comes free on
 * the next run. A dry run never frees a number, so it is the more pessimistic of
 * the two: it can report `taken` where an applied run would repair.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { patients, settings } from '../../db/schema.ts';
import { AppError } from '../../errors/AppError.ts';
import { settingsService } from '../settings/settings.service.ts';

export type RepairVerdict = 'repairable' | 'taken' | 'reserved';

export interface RepairRow {
    patientId: string;
    /** What the record carries now. */
    ref: string;
    /** What the paper file says. */
    oldRef: string;
    verdict: RepairVerdict;
}

export interface RepairReport {
    applied: boolean;
    rows: RepairRow[];
    repairable: number;
    taken: number;
    reserved: number;
}

/**
 * Reports on every record whose ref and old number disagree, and — with
 * `apply` — gives back the ones it safely can.
 *
 * The whole pass is one transaction holding the settings row's lock, which is
 * the lock a registration and a settings write both take: a dry run reads a
 * register nobody is changing, and an applied run cannot leave half of it
 * repaired.
 */
export async function repairPatientRefs({ apply }: { apply: boolean }): Promise<RepairReport> {
    await settingsService.ensureSeeded();

    return db.transaction(async (tx) => {
        const [counter] = await tx
            .select({ next: settings.patientRefNext })
            .from(settings)
            .where(eq(settings.id, 1))
            .for('update');

        if (!counter) throw AppError.internal('settings row could not be read');

        const all = await tx
            .select({ id: patients.id, ref: patients.ref, legacyRef: patients.legacyRef })
            .from(patients)
            .orderBy(patients.createdAt);

        const taken = new Set(all.map((row) => row.ref));
        const rows: RepairRow[] = [];

        for (const row of all) {
            if (row.legacyRef === null || row.legacyRef === row.ref) continue;
            const oldRef = row.legacyRef;

            const verdict: RepairVerdict = taken.has(oldRef)
                ? 'taken'
                : /^\d+$/.test(oldRef) && Number(oldRef) >= counter.next
                  ? 'reserved'
                  : 'repairable';

            if (verdict === 'repairable' && apply) {
                await tx.update(patients).set({ ref: oldRef }).where(eq(patients.id, row.id));
                taken.delete(row.ref);
            }

            // Claimed either way: two files carrying the same number have to be
            // reported as a conflict on a dry run too, not only once one of
            // them has won.
            if (verdict === 'repairable') taken.add(oldRef);

            rows.push({ patientId: row.id, ref: row.ref, oldRef, verdict });
        }

        return {
            applied: apply,
            rows,
            repairable: rows.filter((row) => row.verdict === 'repairable').length,
            taken: rows.filter((row) => row.verdict === 'taken').length,
            reserved: rows.filter((row) => row.verdict === 'reserved').length,
        };
    });
}
