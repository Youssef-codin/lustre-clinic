import { PIASTRES_PER_POUND } from '@mawid/shared';

/**
 * §7.12 — money is integer piastres end to end and becomes a string in exactly
 * one place. That place is `_LocalMoneyValue`; this is the string it renders,
 * split out only so it can be tested without a renderer, and so a button label
 * ("Check out · EGP 400 left") formats through the same function rather than a
 * second one that rounds differently.
 *
 * Piastres are never shown. The clinic charges in whole pounds and a `.00` on
 * every amount is noise. §7.13: `EGP 2,600` in English, symbol trailing in
 * Arabic.
 */

export type CurrencyPosition = 'lead' | 'trail';

/**
 * What is left to pay on a visit: the total charged, less anything already
 * taken. A visit can carry a payment made before checkout, so the amount due is
 * not the amount charged — and clamping a payment to the charged total would
 * let the patient hand over that money twice and leave the server holding a
 * negative balance. §7.6: overpayment is not allowed, and `visit.checkOut` does
 * not check, so the client is what stands in front of it.
 */
export function amountDue(chargedTotal: number, alreadyPaid: number): number {
    return Math.max(chargedTotal - alreadyPaid, 0);
}

/**
 * The only characters an amount field may hold. `decimal-pad` puts a `.` on the
 * keys, and a parser that quietly dropped it would read a typed `12.5` as 125 —
 * a tenfold overcharge with the field still showing `12.5`. Sanitising on the
 * way in means the displayed text and the amount charged cannot disagree.
 */
export function poundsEntry(entry: string): string {
    return entry.replace(/[^\d]/g, '');
}

export function formatMoney(piastres: number, position: CurrencyPosition = 'lead'): string {
    const pounds = Math.round(piastres / PIASTRES_PER_POUND);
    const grouped = String(Math.abs(pounds)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const signed = pounds < 0 ? `-${grouped}` : grouped;
    return position === 'lead' ? `EGP ${signed}` : `${signed} EGP`;
}
