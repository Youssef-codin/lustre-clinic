/**
 * SPEC §9 — money is integer piastres throughout. No floats, no decimal types,
 * anywhere. Parsing happens at the boundary and formatting at the display
 * layer, so nothing in between ever sees a fractional pound.
 *
 * The rules themselves are in `@lustre/shared`, shared with the demo backend.
 */
import { assertAmount as assertAmountWith } from '@lustre/shared';
import { appFail } from '../errors/AppError.ts';

export { computeTotal, type PricedLine } from '@lustre/shared';

export function assertAmount(amount: number, what = 'amount'): number {
    return assertAmountWith(amount, appFail, what);
}
