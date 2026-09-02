/**
 * One clock time, rendered. The strings come from `clock.ts`; what this adds is
 * the two-face split, which is the same problem `MoneyValue` has with `ج.م`:
 * the meridiem is set smaller than the figure, and in Arabic ص/م has to land on
 * the Naskh face without pulling the digits off DM Mono's tabular figures. One
 * `Text` for each keeps that seam explicit — `Text` would otherwise sniff the
 * Arabic and move the whole string.
 *
 * Child order is locale-driven and the row is a plain `row`, never
 * `row-reverse`: Yoga mirrors `row` under RTL, so one order is correct in both
 * directions. Like `MoneyValue`, the language defaults to the layout direction
 * until the F4 localization scaffold lands.
 */
import type { Locale } from '@lustre/shared';
import { I18nManager, StyleSheet, View } from 'react-native';
import type { TextTone, TextVariant, TextWeight } from '../../theme';
import { space, Text } from '../../theme';
import { clock12, formatClock12 } from './clock';

export type TimeValueProps = {
    /** Minutes since midnight. An ISO string goes through `minutesOfDay` first. */
    minutes: number;
    variant?: TextVariant;
    /** The figure only — the meridiem keeps its own variant's weight. */
    weight?: TextWeight;
    tone?: TextTone;
    /** Off where a neighbouring label already says AM or PM. */
    showMeridiem?: boolean;
    language?: Locale;
    testID?: string;
};

// `headline` → `tag` is the day view's established pairing (`Agenda`'s clock
// column); the rest scale from it.
const MERIDIEM_VARIANT: Partial<Record<TextVariant, TextVariant>> = {
    display: 'callout',
    figure: 'callout',
    figure2: 'callout',
    title: 'subhead',
    title2: 'subhead',
    title3: 'subhead',
    amount: 'tag',
    headline: 'tag',
};

function currentLanguage(): Locale {
    return I18nManager.isRTL ? 'ar' : 'en';
}

export function TimeValue({
    minutes,
    variant = 'amount',
    weight,
    tone = 'ink',
    showMeridiem = true,
    language,
    testID,
}: TimeValueProps) {
    const locale = language ?? currentLanguage();
    const { time, meridiem } = clock12(minutes, locale);

    const figure = (
        <Text variant={variant} weight={weight} tone={tone} script="mono">
            {time}
        </Text>
    );

    return (
        <View
            style={styles.row}
            accessible
            accessibilityLabel={formatClock12(minutes, locale)}
            testID={testID}
        >
            {figure}
            {showMeridiem ? (
                <Text
                    variant={MERIDIEM_VARIANT[variant] ?? 'caption'}
                    tone={tone}
                    script={locale === 'ar' ? 'arabic' : 'sans'}
                >
                    {meridiem}
                </Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'baseline', gap: space[1] },
});
