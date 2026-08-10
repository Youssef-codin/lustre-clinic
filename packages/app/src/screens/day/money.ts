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

export function formatMoney(piastres: number, position: CurrencyPosition = 'lead'): string {
    const pounds = Math.round(piastres / PIASTRES_PER_POUND);
    const grouped = String(Math.abs(pounds)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const signed = pounds < 0 ? `-${grouped}` : grouped;
    return position === 'lead' ? `EGP ${signed}` : `${signed} EGP`;
}
