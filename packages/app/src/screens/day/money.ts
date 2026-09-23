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
 *
 * `discountPercent` is presentation only: the discount itself stays whole
 * piastres, and this just says how much of the procedure total it is.
 */
export { formatAmount, formatMoney } from '../../components/domain/money';

export function amountDue(chargedTotal: number, alreadyPaid: number): number {
    return Math.max(chargedTotal - alreadyPaid, 0);
}

export function poundsEntry(entry: string): string {
    return entry.replace(/[^\d]/g, '');
}

/**
 * How much of `procedureTotal` the desk has taken off to charge `charged`, as
 * a whole percent — or null when there is nothing to show: no discount, or no
 * total to measure one against. A discount that is some but not all of the
 * bill never rounds to 0% or 100%, which would read as none or everything.
 */
export function discountPercent(procedureTotal: number, charged: number): number | null {
    if (!Number.isFinite(procedureTotal) || !Number.isFinite(charged) || procedureTotal <= 0) return null;
    const off = procedureTotal - Math.max(charged, 0);
    if (off <= 0) return null;
    if (off >= procedureTotal) return 100;
    return Math.min(Math.max(Math.round((off / procedureTotal) * 100), 1), 99);
}
