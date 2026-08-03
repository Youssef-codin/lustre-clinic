import { ERROR_CODE, MAX_AMOUNT_PIASTRES } from '@mawid/shared';
import { AppError } from '../errors/AppError.ts';

/**
 * SPEC §9 — money is integer piastres throughout. No floats, no decimal types,
 * anywhere. Parsing happens at the boundary and formatting at the display
 * layer, so nothing in between ever sees a fractional pound.
 */

export function assertAmount(amount: number, what = 'amount'): number {
    if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT_PIASTRES) {
        throw new AppError(ERROR_CODE.INVALID_AMOUNT, `${what} is out of range`, 422);
    }
    return amount;
}

export interface PricedLine {
    unitPrice: number;
    quantity: number;
    isCheckup: boolean;
}

/**
 * §9:
 *
 *     computed_total = Σ (unit_price × quantity)
 *                      minus checkup lines, if any non-checkup line exists
 *
 * The checkup waiver is the only automatic rule. The checkup line is never
 * deleted — it is excluded from the sum, and stays on the visit as the record
 * that the patient was seen.
 */
export function computeTotal(lines: readonly PricedLine[]): number {
    const hasOther = lines.some((line) => !line.isCheckup);
    const counted = hasOther ? lines.filter((line) => !line.isCheckup) : lines;

    return counted.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}
