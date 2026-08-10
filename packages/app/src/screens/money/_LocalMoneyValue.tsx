import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import type { TextTone, TextVariant, TextWeight } from '../../theme';
import { space, Text } from '../../theme';
import { currencyLeads, currencyOf, formatEgp, type MoneyLocale } from './money';

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
 * The children are ordered by locale and the row is left plain, so Yoga's own
 * mirroring finishes the job. `row` puts the first child at the main-axis start
 * — the left edge under LTR, the right edge under RTL — which is what makes one
 * child order correct in both. Written out, because this is easy to get
 * backwards and the reference is always what `formatEgp` produces as a single
 * string:
 *
 *     locale  children            layout  first child  reads as
 *     en      [currency, figure]  LTR     left         EGP 2,600
 *     en      [currency, figure]  RTL     right        EGP 2,600
 *     ar      [figure, currency]  LTR     left         2,600 ج.م
 *     ar      [figure, currency]  RTL     right        2,600 ج.م
 *
 * The RTL rows are the ones worth checking: the figure takes the right edge and
 * the currency sits to its left, so a reader scanning from the right meets the
 * number first — §7.13's order, and the same thing bidi does to the single
 * string, whose base direction puts its leading run on the right too.
 *
 * The `ar`/LTR row is not hypothetical: `I18nManager.allowRTL` lands with the
 * localisation scaffold, so an Arabic amount today renders inside an LTR layout
 * (BLOCKED.md #10). Reasoned against Yoga's rules and against the string form,
 * not yet seen on a device in either direction.
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

    const currencyText = (
        <Text variant={currencyVariant ?? variant} tone={tone} weight={weight}>
            {currencyOf(locale)}
        </Text>
    );

    return (
        <View
            style={[styles.row, style]}
            testID={testID}
            accessible
            // A screen reader gets the whole number even when the figure is
            // compact — `142.6k` is the one rendering where it is the wrong
            // answer — and gets it as one phrase rather than two fragments. It
            // also gets the parts in reading order whatever the layout does.
            accessibilityLabel={formatEgp(amount, { locale })}
        >
            {currencyLeads(locale) ? (
                <>
                    {currencyText}
                    {figureText}
                </>
            ) : (
                <>
                    {figureText}
                    {currencyText}
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    // Plain `row`, never `row-reverse`: Yoga flips `row` under RTL and un-flips
    // `row-reverse`, so reversing here would cancel the mirroring that makes one
    // child order right in both directions.
    row: { flexDirection: 'row', alignItems: 'baseline', gap: space[1] },
});
