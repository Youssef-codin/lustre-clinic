/**
 * What the day cluster does with money, which is now only the two rules that
 * are its own. Formatting is `components/domain/money` — §7.12 puts every
 * amount through one implementation, and this file used to hold a second one.
 * The pair is re-exported so the visit screens' string labels keep one import.
 *
 * `amountDue` is the charge less anything already taken; clamping a payment to
 * the charged total would let it be handed over twice, and because
 * `visit.checkOut` does not enforce §7.6, the client stands in front of
 * overpayment. `poundsEntry` sanitises on the way in so a typed `12.5` can
 * never be read as 125 with the field still showing `12.5`.
 */
export { formatAmount, formatMoney } from '../../components/domain/money';

export function amountDue(chargedTotal: number, alreadyPaid: number): number {
    return Math.max(chargedTotal - alreadyPaid, 0);
}

export function poundsEntry(entry: string): string {
    return entry.replace(/[^\d]/g, '');
}
