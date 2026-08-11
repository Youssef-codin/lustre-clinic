// Turning piastres into money, kept apart from the component so it can be
// tested without a renderer. §7.12: integer piastres end to end, formatted at
// the edge in one place — piastres are never shown, so 260050 reads `EGP 2,601`.
// §7.13: the symbol trails in Arabic; §7.11: numerals stay Latin in both (DM
// Mono has no Arabic-Indic coverage). Grouping is written out rather than left
// to `Intl`, which Hermes ships cut-down. Rounding is applied to the magnitude,
// not the signed value: `Math.round` breaks ties toward +∞, so a negative
// amount would otherwise lose its sign or land on -0.
export type MoneyLocale = 'en' | 'ar';

const SYMBOL: Record<MoneyLocale, string> = { en: 'EGP', ar: 'ج.م' };

export function formatMoney(amount: number, locale: MoneyLocale = 'en'): string {
    const magnitude = Math.round(Math.abs(amount) / 100);
    const grouped = magnitude.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const signed = amount < 0 && magnitude > 0 ? `-${grouped}` : grouped;
    return locale === 'ar' ? `${signed} ${SYMBOL.ar}` : `${SYMBOL.en} ${signed}`;
}
