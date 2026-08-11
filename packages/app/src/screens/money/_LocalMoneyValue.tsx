// `_Local` per §10: `domain/MoneyValue` does not exist yet. This is the only
// place the cluster turns an amount into text; the arithmetic lives in
// `money.ts`, which has no React Native import and is testable. The figure and
// the currency are separate Texts — the figure is DM Mono (tabular numerals,
// §7.11), the currency takes the ambient face because `ج.م` has no mono
// coverage. Child order is locale-driven and the row is a plain `row`, never
// `row-reverse`: Yoga mirrors `row` under RTL and un-mirrors `row-reverse`, so
// a plain row makes one child order correct in both directions. The
// screen-reader label is always the full figure, never the compact one.
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import type { TextTone, TextVariant, TextWeight } from '../../theme';
import { space, Text } from '../../theme';
import { currencyLeads, currencyOf, formatEgp, type MoneyLocale } from './money';

export type MoneyValueProps = {
    amount: number;
    variant?: TextVariant;
    currencyVariant?: TextVariant;
    tone?: TextTone;
    weight?: TextWeight;
    compact?: boolean;
    locale?: MoneyLocale;
    showCurrency?: boolean;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

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
    row: { flexDirection: 'row', alignItems: 'baseline', gap: space[1] },
});
