import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import type { TextTone, TextVariant, TextWeight } from '../../theme';
import { space, Text } from '../../theme';
import { currencyOf, formatEgp, type MoneyLocale } from './money';

// `domain/MoneyValue` (Inventory §5, §10) does not exist — `components/domain/`
// has not been created. Built local per the §10 rule; see BLOCKED.md #1. When it
// is promoted, this file becomes a re-export and then goes away.
//
// This is the *only* place in the cluster that turns an amount into text. The
// arithmetic and the formatting rules live in `money.ts` beside it, which has no
// React Native import and is therefore testable.

export type MoneyValueProps = {
    /** Integer piastres, exactly as the server sent it. Never a float. */
    amount: number;
    /** The figure's size. Mono variants keep their tabular numerals. */
    variant?: TextVariant;
    /** The currency's size, when it should be smaller than the figure. */
    currencyVariant?: TextVariant;
    tone?: TextTone;
    weight?: TextWeight;
    compact?: boolean;
    locale?: MoneyLocale;
    showCurrency?: boolean;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

/**
 * Two `Text`s: the figure and the currency are set in different faces on
 * purpose. The figure is always DM Mono, so a column of amounts aligns on the
 * digit however long they are (§7.11 keeps the numerals Latin in both languages
 * for exactly this reason). The currency takes the ambient face, because
 * `ج.م` has no coverage in DM Mono and would render as boxes.
 *
 * The children are always in the order currency-then-figure, and the row is
 * logical, so RTL mirrors it into figure-then-`ج.م` — §7.13's Arabic order — with
 * no per-locale branch. That mirroring needs `I18nManager.allowRTL`, which lands
 * with the localisation scaffold; see BLOCKED.md #10. Nothing passes `locale`
 * yet, so the Arabic order is written but not yet seen.
 */
export function MoneyValue({
    amount,
    variant = 'amount',
    currencyVariant,
    tone = 'ink',
    weight,
    compact = false,
    locale = 'en',
    showCurrency = true,
    style,
    testID,
}: MoneyValueProps) {
    const figure = formatEgp(amount, { compact, locale, showCurrency: false });

    const figureText = (
        <Text variant={variant} tone={tone} weight={weight} script="mono">
            {figure}
        </Text>
    );

    if (!showCurrency) {
        return figureText;
    }

    return (
        <View
            style={[styles.row, style]}
            testID={testID}
            accessible
            // A screen reader gets the whole number even when the figure is
            // compact — `142.6k` is the one rendering where it is the wrong
            // answer — and gets it as one phrase rather than two fragments.
            accessibilityLabel={formatEgp(amount, { locale })}
        >
            <Text variant={currencyVariant ?? variant} tone={tone} weight={weight}>
                {currencyOf(locale)}
            </Text>
            {figureText}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'baseline', gap: space[1] },
});
