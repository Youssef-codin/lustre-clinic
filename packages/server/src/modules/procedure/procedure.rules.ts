import { ERROR_CODE, type Tooth } from '@mawid/shared';
import { AppError } from '../../errors/AppError.ts';
import { type Procedure, procedureService } from './procedure.service.ts';

/**
 * SPEC §5. The rules a requested procedure list must satisfy, shared by visits
 * (what was done) and appointments (what is planned). They live here rather
 * than in either service so the two cannot drift: a list the secretary is
 * allowed to book is exactly a list the doctor is allowed to record.
 */

export interface RequestedLine {
    procedureId: string;
    quantity: number;
    tooth?: Tooth | null;
    note?: string | null;
}

export interface ResolvedLine {
    procedure: Procedure;
    quantity: number;
    tooth: Tooth | null;
    note: string | null;
}

/**
 * Resolves each line against the catalogue and applies §5. Throws on the first
 * offending line; callers map the result onto their own row shape.
 */
export async function resolveProcedureLines(lines: RequestedLine[]): Promise<ResolvedLine[]> {
    // Catalogue reads are independent, so they go out together. The rules below
    // are then applied in request order, so the line a client is told about is
    // the first offending one rather than whichever query happened to land first.
    const procedures = await Promise.all(
        lines.map((line) => procedureService.requireSelectable(line.procedureId)),
    );

    // §5 — uniqueness is per tooth, not per procedure: an extraction on UL6 and
    // one on UR3 are two real lines. Lines with no tooth share the single
    // empty-string key, so the old once-per-list rule still holds for
    // procedures that are not tooth-specific.
    const seen = new Set<string>();

    return lines.map((line, i) => {
        const procedure = procedures[i];
        if (!procedure) throw AppError.internal('procedure resolution returned nothing');
        const tooth = line.tooth ?? null;

        // §5 — `is_tooth_specific` decides whether a tooth belongs on the line
        // at all, so an extraction cannot be filed against no tooth and a
        // consultation cannot be filed against UL6.
        if (procedure.isToothSpecific && !tooth) {
            throw new AppError(
                ERROR_CODE.TOOTH_REQUIRED,
                'that procedure must name the tooth it was done on',
                422,
            );
        }
        if (!procedure.isToothSpecific && tooth) {
            throw new AppError(
                ERROR_CODE.TOOTH_NOT_APPLICABLE,
                'that procedure is not done on a specific tooth',
                422,
            );
        }

        if (!procedure.hasQuantity) {
            const key = `${procedure.id}:${tooth ?? ''}`;
            if (seen.has(key)) {
                throw new AppError(
                    ERROR_CODE.PROCEDURE_DUPLICATE,
                    tooth
                        ? 'that procedure may appear only once per tooth'
                        : 'that procedure may appear only once',
                    422,
                );
            }
            seen.add(key);
            if (line.quantity !== 1) {
                throw new AppError(ERROR_CODE.VALIDATION, 'that procedure does not take a quantity', 422);
            }
        }

        return { procedure, quantity: line.quantity, tooth, note: line.note ?? null };
    });
}
