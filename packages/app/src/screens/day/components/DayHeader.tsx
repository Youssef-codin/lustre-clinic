import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Chevron, IconButton } from '../../../components/ui';
import { color, radius, size, space, Text } from '../../../theme';
import { formatDate, relativeDayLabel, todayKey } from '../time';

/**
 * The date, and the two arrows the secretary lives on.
 *
 * The date itself is the calendar trigger. It is the biggest thing on the
 * screen and it is already where the eye goes when the question is "what day am
 * I looking at" — a separate calendar icon would be a second answer to the same
 * question.
 */

export type DayHeaderProps = {
    dateKey: string;
    /** Below the date: what is on that day, or why it is empty. */
    summary: string;
    onPrevious: () => void;
    onNext: () => void;
    onToday: () => void;
    onOpenCalendar: () => void;
};

export function DayHeader({ dateKey, summary, onPrevious, onNext, onToday, onOpenCalendar }: DayHeaderProps) {
    const isToday = dateKey === todayKey();
    const label = relativeDayLabel(dateKey);

    return (
        <View style={styles.header}>
            <View style={styles.row}>
                <IconButton
                    accessibilityLabel="Previous day"
                    icon={<Chevron direction="back" tone="ink" size={9} />}
                    variant="square"
                    onPress={onPrevious}
                />

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${label}, ${formatDate(dateKey)}. Open the calendar`}
                    onPress={onOpenCalendar}
                    style={styles.date}
                >
                    <Text variant="title2" weight="semibold">
                        {label}
                    </Text>
                    <Text variant="subhead" tone="muted">
                        {/* The relative label hides the date, so it goes back underneath. */}
                        {label === formatDate(dateKey) ? summary : `${formatDate(dateKey)} · ${summary}`}
                    </Text>
                </Pressable>

                <IconButton
                    accessibilityLabel="Next day"
                    icon={<Chevron direction="forward" tone="ink" size={9} />}
                    variant="square"
                    onPress={onNext}
                />
            </View>

            {/* One tap back from wherever she wandered to. Absent on today, where
                it would be a button that does nothing. */}
            {isToday ? null : (
                <View style={styles.back}>
                    <Button label="Back to today" variant="text" size="md" onPress={onToday} />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: size.gutter,
        paddingTop: space[2],
        paddingBottom: space[3],
        backgroundColor: color.surface,
        borderBottomWidth: 1,
        borderBottomColor: color.line,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    date: {
        flex: 1,
        alignItems: 'center',
        minHeight: size.row,
        justifyContent: 'center',
        borderRadius: radius.md,
    },
    back: { alignItems: 'center', marginTop: space[1] },
});
