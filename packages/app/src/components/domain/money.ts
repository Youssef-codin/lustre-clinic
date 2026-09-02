/**
 * The money rules themselves — §7.12, integer piastres end to end, turned into
 * a string in one place. `MoneyValue` is that place on screen; this file is the
 * same arithmetic for everything that is not a component: a toast, a button
 * label, a WhatsApp template, an accessibility string, a price field's parser.
 *
 * Split out of `MoneyValue.tsx` the way `patientDraft` is split out, and for the
 * same reason: that file imports `react-native`, which fails outside Metro, and
 * three cluster suites format money under `bun test` with no renderer. Nothing
 * here may import `react-native`.
 *
 * Rounding is applied to the magnitude, not the signed value. `Math.round`
 * breaks ties toward +∞, so `-950` piastres rounded signed lands on `-9` while
 * `+950` lands on `10` — the same half-pound reading differently either side of
 * zero. The `magnitude > 0` guard is what stops a small negative printing as
 * `-0`.
 *
 * Grouping is written out rather than left to `Intl`, which Hermes ships
 * cut-down.
 *
 * `language` has no default beyond English here. The direction-aware form —
 * which infers Arabic from the layout direction until the F4 localization
 * scaffold lands — needs `I18nManager`, so it lives in `MoneyValue.tsx` and is
 * what `components/domain` exports. Import from this file when you need the
 * arithmetic without a renderer; import from the barrel when you are on screen.
 */
import type { Locale } from '@lustre/shared';
import { PIASTRES_PER_POUND } from '@lustre/shared';

export const CURRENCY: Record<Locale, string> = { en: 'EGP', ar: 'ج.م' };

/** Below this the full number is shorter than the compact form anyway. */
const COMPACT_FLOOR = 10_000;

export type MoneyOptions = { compact?: boolean; language?: Locale };

/** What the amount reads as on screen, in whole pounds. */
export function toPounds(piastres: number): number {
    const magnitude = Math.round(Math.abs(piastres) / PIASTRES_PER_POUND);
    return piastres < 0 ? -magnitude : magnitude;
}

/** The figure with no currency on it, for a column that has already said it is money. */
export function formatAmount(piastres: number, compact = false): string {
    const pounds = toPounds(piastres);
    const magnitude = Math.abs(pounds);
    const grouped = compact ? compactPounds(magnitude) : group(magnitude);
    return pounds < 0 && magnitude > 0 ? `-${grouped}` : grouped;
}

export function formatMoney(piastres: number, options: MoneyOptions = {}): string {
    const language = options.language ?? 'en';
    const amount = formatAmount(piastres, options.compact);
    return language === 'ar' ? `${amount} ${CURRENCY.ar}` : `${CURRENCY.en} ${amount}`;
}

function group(magnitude: number): string {
    return String(magnitude).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function compactPounds(magnitude: number): string {
    if (magnitude >= 1_000_000) return `${trim(magnitude / 1_000_000)}m`;
    if (magnitude >= COMPACT_FLOOR) return `${trim(magnitude / 1_000)}k`;
    return group(magnitude);
}

function trim(value: number): string {
    return value.toFixed(1).replace(/\.0$/, '');
}

/** A price field takes digits and nothing else: `12.50` read as `1250` is a hundredfold overcharge. */
export function sanitisePounds(text: string): string {
    return text.replace(/[^0-9]/g, '');
}

/** Pounds typed into a field, as the piastres to send. */
export function poundsToPiastres(pounds: string): number {
    const digits = sanitisePounds(pounds);
    return digits ? Number(digits) * PIASTRES_PER_POUND : 0;
}
