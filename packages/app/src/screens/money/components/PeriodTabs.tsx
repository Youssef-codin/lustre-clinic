import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from '../../../components/ui';
import { size, space } from '../../../theme';
import { PERIOD_LABEL, PERIODS, type Period } from '../_LocalMoneyApi';

// Inventory §5 `domain/PeriodTabs` — horizontally scrolling pills, Today to All
// time. Local to money: nothing else in the app is period-scoped.
//
// These drive the hero, the stat cards and the takings card, all three of which
// are range queries. They deliberately do NOT filter the debtors list: an
// outstanding balance is a standing figure, not a period one (§10), and a debtor
// list that emptied when you tapped "Today" would be read as "nobody owes
// anything" rather than "nobody was charged today".

export type PeriodTabsProps = {
    value: Period;
    onChange: (period: Period) => void;
};

export function PeriodTabs({ value, onChange }: PeriodTabsProps) {
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.track}
            accessibilityRole="tablist"
        >
            {PERIODS.map((period) => (
                <Chip
                    key={period}
                    label={PERIOD_LABEL[period]}
                    selected={period === value}
                    onPress={() => onChange(period)}
                    testID={`money-period-${period}`}
                />
            ))}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    track: { gap: space[2], paddingHorizontal: size.gutter, paddingVertical: space[1] },
});
