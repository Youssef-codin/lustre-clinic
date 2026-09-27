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
 * `discountPercent` is presentation only: prices stay whole piastres, and this
 * just says how far a typed price sits under the catalogue's.
 */
import type { Visit, VisitLine } from './data/types';

export { formatAmount, formatMoney } from '../../components/domain/money';

export function amountDue(chargedTotal: number, alreadyPaid: number): number {
    return Math.max(chargedTotal - alreadyPaid, 0);
}

export function poundsEntry(entry: string): string {
    return entry.replace(/[^\d]/g, '');
}

/**
 * How much under `procedureTotal` (a procedure's default price) `charged` is, as
 * a whole percent — or null when there is nothing to show: no discount, or no
 * default to measure one against. A discount that is some but not all of the
 * price never rounds to 0% or 100%, which would read as none or everything.
 */
export function discountPercent(procedureTotal: number, charged: number): number | null {
    if (!Number.isFinite(procedureTotal) || !Number.isFinite(charged) || procedureTotal <= 0) return null;
    const off = procedureTotal - Math.max(charged, 0);
    if (off <= 0) return null;
    if (off >= procedureTotal) return 100;
    return Math.min(Math.max(Math.round((off / procedureTotal) * 100), 1), 99);
}

/**
 * How far the procedures came in under the catalogue, together: `usual` is
 * what they cost at the defaults, and `off` is how much less they are charged
 * at. A line priced above its default counts against a line priced under
 * one, so a visit charged more than its usual total shows no discount at all.
 * A line whose default is unknown counts at its own price on both sides. Null
 * when nothing is off.
 */
export function procedureDiscount(
    lines: ReadonlyArray<{ procedureId: string; unitPrice: number; quantity: number }>,
    defaults: ReadonlyMap<string, number>,
): { off: number; usual: number; percent: number } | null {
    let usual = 0;
    let charged = 0;
    for (const line of lines) {
        usual += (defaults.get(line.procedureId) ?? line.unitPrice) * line.quantity;
        charged += line.unitPrice * line.quantity;
    }
    const percent = discountPercent(usual, charged);
    return percent === null ? null : { off: usual - charged, usual, percent };
}

export interface PricedLine extends VisitLine {
    unitPrice: number;
    lineTotal: number;
}

export interface PricedVisit extends Visit {
    chargedTotal: number;
    computedTotal: number;
    procedures: PricedLine[];
}

/**
 * The visit with its amounts, or null when this phone is not shown them: the
 * server withholds a finished visit's charge and prices from a doctor's phone.
 * The screens that price or take money are only for a visit that has them.
 */
export function pricedVisit(visit: Visit): PricedVisit | null {
    const { chargedTotal, computedTotal } = visit;
    if (chargedTotal === null || computedTotal === null) return null;
    const procedures: PricedLine[] = [];
    for (const line of visit.procedures) {
        if (line.unitPrice === null || line.lineTotal === null) return null;
        procedures.push({ ...line, unitPrice: line.unitPrice, lineTotal: line.lineTotal });
    }
    return { ...visit, chargedTotal, computedTotal, procedures };
}
