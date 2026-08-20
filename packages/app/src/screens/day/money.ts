/**
 * §7.12 — money is integer piastres end to end and becomes a string in exactly
 * one place, `_LocalMoneyValue`; this file is the string it renders, split out
 * only so it can be tested without a renderer and a button label formats
 * through the same function. Piastres are never shown — the clinic charges in
 * whole pounds (§7.13: `EGP 2,600` leads in English, trails in Arabic).
 * `amountDue` is the charge less anything already taken; clamping a payment to
 * the charged total would let it be handed over twice, and because
 * `visit.checkOut` does not enforce §7.6, the client stands in front of
 * overpayment. `poundsEntry` sanitises on the way in so a typed `12.5` can
 * never be read as 125 with the field still showing `12.5`.
 */
import { PIASTRES_PER_POUND } from '@lustre/shared';

export type CurrencyPosition = 'lead' | 'trail';

export function amountDue(chargedTotal: number, alreadyPaid: number): number {
    return Math.max(chargedTotal - alreadyPaid, 0);
}

export function poundsEntry(entry: string): string {
    return entry.replace(/[^\d]/g, '');
}

/**
 * The figure with no currency on it. The visit screens set `EGP` as its own
 * label beside a subtotal or a cost field, and a formatter that always carried
 * the currency would put it on screen twice.
 */
export function formatAmount(piastres: number): string {
    const pounds = Math.round(piastres / PIASTRES_PER_POUND);
    const grouped = String(Math.abs(pounds)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return pounds < 0 ? `-${grouped}` : grouped;
}

export function formatMoney(piastres: number, position: CurrencyPosition = 'lead'): string {
    const amount = formatAmount(piastres);
    return position === 'lead' ? `EGP ${amount}` : `${amount} EGP`;
}
