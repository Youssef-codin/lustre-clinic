/**
 * When the booking is — a fortnight of days, and the times that day still has
 * free. It draws what `BookingScreen` fetched rather than fetching itself,
 * so the grid and the Book button read the same slots: the button has to refuse
 * a time that went while the note was being typed, and it can only do that if
 * there is one answer to "is 3:00 free", not two.
 *
 * A taken time is drawn and disabled, not hidden. "3:00 is gone, 3:30 is free"
 * is the sentence said on the phone, and a grid that silently omits 3:00 makes
 * the receptionist count the gaps herself. Closed days stay in the strip for the
 * same reason — "we're shut Friday" is an answer, an absent Friday is not.
 */
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Callout, Chip } from '../../../components/ui';
import { border, color, radius, space, Text } from '../../../theme';
import type { Slot } from '../booking';
import type { ClinicDay, RequestError } from '../data';
import { describeError } from '../errors';
import { isClosed } from '../hours';
import { addDays, clock12, relativeDayLabel, todayKey } from '../time';

const STRIP_DAYS = 14;

export type SlotPickerProps = {
    dateKey: string;
    onPickDate: (dateKey: string) => void;
    slotMinutes: number | null;
    onPickSlot: (minutes: number | null) => void;
    slots: readonly Slot[];
    /** The day behind the grid: it has to say "still loading" before "no times". */
    loading: boolean;
    error: RequestError | null;
    onRetry: () => void;
    schedule: readonly ClinicDay[] | undefined;
};

export function SlotPicker({
    dateKey,
    onPickDate,
    slotMinutes,
    onPickSlot,
    slots,
    loading,
    error,
    onRetry,
    schedule,
}: SlotPickerProps) {
    const today = todayKey();
    const days = Array.from({ length: STRIP_DAYS }, (_, index) => addDays(today, index));

    const closed = isClosed(dateKey, schedule);
    const picked = slots.find((slot) => slot.minutes === slotMinutes) ?? null;
    const free = slots.filter((slot) => slot.state === 'free').length;

    return (
        <View style={styles.step}>
            <View style={styles.section}>
                <Text variant="eyebrow" tone="muted">
                    WHICH DAY
                </Text>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.strip}
                >
                    {days.map((key) => (
                        <Chip
                            key={key}
                            label={
                                isClosed(key, schedule)
                                    ? `${relativeDayLabel(key)} · closed`
                                    : relativeDayLabel(key)
                            }
                            selected={key === dateKey}
                            disabled={isClosed(key, schedule)}
                            onPress={() => {
                                onPickDate(key);
                                onPickSlot(null);
                            }}
                        />
                    ))}
                </ScrollView>
            </View>

            <View style={styles.section}>
                <View style={styles.timesHead}>
                    <Text variant="eyebrow" tone="muted">
                        WHAT TIME
                    </Text>
                    {!closed && !loading && !error && slots.length > 0 ? (
                        <Text variant="caption" tone="muted">
                            {free} free
                        </Text>
                    ) : null}
                </View>

                {closed ? (
                    <Callout tone="warning" title="The clinic is closed that day">
                        Pick another day, or open the day in Settings first.
                    </Callout>
                ) : loading ? (
                    <Text variant="subhead" tone="muted">
                        Reading that day…
                    </Text>
                ) : error ? (
                    <View style={styles.failure}>
                        <Text variant="subhead" tone="due">
                            {describeError(error, 'day').title}
                        </Text>
                        <Button label="Try again" variant="text" size="md" onPress={onRetry} />
                    </View>
                ) : slots.length === 0 ? (
                    <Text variant="subhead" tone="muted">
                        No times that day.
                    </Text>
                ) : (
                    <>
                        <View style={styles.grid}>
                            {slots.map((slot) => (
                                <SlotChip
                                    key={slot.minutes}
                                    slot={slot}
                                    selected={slot.minutes === slotMinutes}
                                    onPress={() => onPickSlot(slot.minutes)}
                                />
                            ))}
                        </View>

                        {picked && picked.state !== 'free' ? (
                            <Callout
                                tone="warning"
                                title={
                                    picked.state === 'taken'
                                        ? 'That time is already booked'
                                        : 'That time has gone by'
                                }
                            >
                                Pick another one — a shorter visit may also fit.
                            </Callout>
                        ) : picked?.runsLate ? (
                            <Text variant="caption" tone="muted">
                                That visit ends after the clinic closes.
                            </Text>
                        ) : null}
                    </>
                )}
            </View>
        </View>
    );
}

function SlotChip({ slot, selected, onPress }: { slot: Slot; selected: boolean; onPress: () => void }) {
    const { time, meridiem } = clock12(slot.minutes);

    return (
        <View style={styles.slot}>
            <Chip
                label={`${time} ${meridiem.toLowerCase()}`}
                selected={selected}
                disabled={slot.state !== 'free'}
                grow
                onPress={onPress}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    step: { gap: space[5] },
    section: { gap: space[2.5] },
    strip: { gap: space[2], paddingEnd: space[4] },
    timesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    slot: { width: '31.5%' },
    failure: {
        gap: space[2],
        padding: space[3],
        borderRadius: radius.lg,
        borderWidth: border.hair,
        borderColor: color.line,
    },
});
