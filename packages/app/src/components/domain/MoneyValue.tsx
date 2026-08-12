/**
 * The only place money is formatted (Component Inventory §7.12): integer piastres
 * in, whole EGP out — piastres are never shown. Latin numerals are pinned to
 * en-US in both languages because DM Mono has no Arabic-Indic coverage and the
 * money screens depend on tabular alignment (§7.11); in Arabic the symbol is
 * `ج.م` and trails the figure (§7.13). Until the localization scaffold lands
 * (F4), the language is inferred from the layout direction.
 */
import type { Locale } from '@lustre/shared';
import { PIASTRES_PER_POUND } from '@lustre/shared';
import { I18nManager, StyleSheet, View } from 'react-native';
import type { TextTone, TextVariant } from '../../theme';
import { space, Text } from '../../theme';

export type MoneyValueProps = {
    piastres: number;
    compact?: boolean;
    variant?: TextVariant;
    tone?: TextTone;
    showCurrency?: boolean;
    language?: Locale;
    testID?: string;
};

const CURRENCY: Record<Locale, string> = { en: 'EGP', ar: 'ج.م' };

const SYMBOL_VARIANT: Partial<Record<TextVariant, TextVariant>> = {
    display: 'callout',
    figure: 'callout',
    title: 'subhead',
    title2: 'subhead',
    title3: 'subhead',
    amount: 'footnote',
};

const GROUPED = new Intl.NumberFormat('en-US');
const COMPACT_FLOOR = 10_000;

function pounds(piastres: number): number {
    return Math.round(piastres / PIASTRES_PER_POUND);
}

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

export function formatAmount(piastres: number, compact = false): string {
    const value = pounds(piastres);
    return compact ? compactPounds(value) : GROUPED.format(value);
}

export function formatMoney(piastres: number, options: { compact?: boolean; language?: Locale } = {}) {
    const language = options.language ?? currentLanguage();
    const amount = formatAmount(piastres, options.compact);
    return language === 'ar' ? `${amount} ${CURRENCY.ar}` : `${CURRENCY.en} ${amount}`;
}

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
