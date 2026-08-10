import type { Locale } from '@mawid/shared';
import { PIASTRES_PER_POUND } from '@mawid/shared';
import { I18nManager, StyleSheet, View } from 'react-native';
import type { TextTone, TextVariant } from '../../theme';
import { space, Text } from '../../theme';

/**
 * Every amount in the app, and the only place money is formatted (Component
 * Inventory §7.12).
 *
 * Integer piastres in, whole EGP out. Piastres are never shown: they exist so
 * the server can hold money as an integer, and the clinic prices in pounds.
 * Nothing else formats an amount — if a screen needs a string rather than a
 * view (a WhatsApp template, an accessibility label), it calls `formatMoney`
 * from this file.
 *
 *     <MoneyValue piastres={260_000} />              // EGP 2,600
 *     <MoneyValue piastres={260_000} tone="due" />   // owed
 *     <MoneyValue piastres={14_260_000} compact />   // EGP 142.6k
 */

export type MoneyValueProps = {
    /** Integer piastres, as the server stores and sends it. */
    piastres: number;
    /**
     * `142.6k` instead of `142,600`. §7.12 scopes this to the money hero and the
     * stat cards; everywhere else shows the number in full.
     */
    compact?: boolean;
    /** Size from the type ramp. Numerals are always mono, whatever this is. */
    variant?: TextVariant;
    tone?: TextTone;
    /** Hide `EGP` where a column header or a label already carries it. */
    showCurrency?: boolean;
    /** Defaults to the app's direction. §7.13 puts the symbol last in Arabic. */
    language?: Locale;
    testID?: string;
};

/** §7.13. Arabic trails the symbol, and uses `ج.م` — the copy the designs use. */
const CURRENCY: Record<Locale, string> = { en: 'EGP', ar: 'ج.م' };

/**
 * The symbol sits a step below the figure, and never in a mono variant: DM Mono
 * has no Arabic coverage, so `ج.م` in `amount` would render as tofu.
 */
const SYMBOL_VARIANT: Partial<Record<TextVariant, TextVariant>> = {
    display: 'callout',
    figure: 'callout',
    title: 'subhead',
    title2: 'subhead',
    title3: 'subhead',
    amount: 'footnote',
};

/**
 * §7.11: Latin numerals in both languages. DM Mono has no Arabic-Indic
 * coverage, and a localized numeral would break the tabular alignment the money
 * screens are built on — so the locale is pinned rather than taken from the
 * device.
 */
const GROUPED = new Intl.NumberFormat('en-US');
const COMPACT_FLOOR = 10_000;

function pounds(piastres: number): number {
    return Math.round(piastres / PIASTRES_PER_POUND);
}

/** `142.6k`, `1.4m` — one decimal, and never a trailing `.0`. */
function compactPounds(value: number): string {
    const sign = value < 0 ? '-' : '';
    const magnitude = Math.abs(value);

    if (magnitude >= 1_000_000) return `${sign}${trim(magnitude / 1_000_000)}m`;
    if (magnitude >= COMPACT_FLOOR) return `${sign}${trim(magnitude / 1_000)}k`;
    return GROUPED.format(value);
}

function trim(value: number): string {
    return value.toFixed(1).replace(/\.0$/, '');
}

/** Just the figure — `2,600`. */
export function formatAmount(piastres: number, compact = false): string {
    const value = pounds(piastres);
    return compact ? compactPounds(value) : GROUPED.format(value);
}

/**
 * The whole thing as a string, for the places a component cannot go: a reminder
 * template, an accessibility label, a toast. Same rules as the component.
 */
export function formatMoney(piastres: number, options: { compact?: boolean; language?: Locale } = {}) {
    const language = options.language ?? currentLanguage();
    const amount = formatAmount(piastres, options.compact);
    return language === 'ar' ? `${amount} ${CURRENCY.ar}` : `${CURRENCY.en} ${amount}`;
}

/**
 * The seam for the localization scaffold (F4). Until it lands, direction is the
 * only signal the app has for which language it is in.
 */
function currentLanguage(): Locale {
    return I18nManager.isRTL ? 'ar' : 'en';
}

export function MoneyValue({
    piastres,
    compact = false,
    variant = 'amount',
    tone = 'ink',
    showCurrency = true,
    language,
    testID,
}: MoneyValueProps) {
    const locale = language ?? currentLanguage();
    const amount = formatAmount(piastres, compact);

    const symbol = showCurrency ? (
        <Text variant={SYMBOL_VARIANT[variant] ?? 'caption'} tone={tone} script="sans">
            {CURRENCY[locale]}
        </Text>
    ) : null;

    const figure = (
        <Text variant={variant} tone={tone} script="mono">
            {amount}
        </Text>
    );

    // Ordered by language, laid out by direction. In Arabic the row runs
    // right-to-left, so figure-then-symbol renders as `2,600 ج.م`.
    return (
        <View
            style={styles.row}
            accessible
            accessibilityLabel={formatMoney(piastres, { compact, language: locale })}
            testID={testID}
        >
            {locale === 'ar' ? (
                <>
                    {figure}
                    {symbol}
                </>
            ) : (
                <>
                    {symbol}
                    {figure}
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'baseline', gap: space[1] },
});
