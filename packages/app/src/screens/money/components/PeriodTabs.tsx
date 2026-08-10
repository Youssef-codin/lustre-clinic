// Period pills that drive the hero, the stat cards and the takings card — all
// range queries. They deliberately do not filter the debtors list: an
// outstanding balance is a standing figure, not a period one, and a list that
// emptied on "Today" would read as "nobody owes anything".
import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from '../../../components/ui';
import { size, space } from '../../../theme';
import { PERIOD_LABEL, PERIODS, type Period } from '../_LocalMoneyApi';

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
