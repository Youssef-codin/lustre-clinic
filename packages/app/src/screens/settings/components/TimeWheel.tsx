/**
 * Opening and closing time, on a wheel of our own: the row that shows a time
 * (`TimeField`) and the three columns that edit one (`TimeWheel`).
 *
 * They are two components rather than one control because **the wheel cannot
 * live in a sheet of its own.** The field it edits is already inside the day
 * editor's sheet, and a `Sheet` inside a `Sheet` does not open — the outer one
 * goes with it and both are gone. That is the same hazard `AppointmentDetailSheet`
 * met with its destructive confirms, and this is the same answer: the wheel is
 * drawn *in* the sheet that asked for it, in place of the form, with the footer
 * swapped for its own Set and Cancel. One sheet, two faces.
 *
 * **Why not the platform picker.** It was, and the trade it made no longer
 * holds. It came with `is24Hour: false` bolted on to stop the *device's*
 * 12/24-hour setting overriding the app's — an override that had to be right, in
 * the one control that edits a time — and it still drew its own AM/PM from the
 * OS locale, so an English-locale phone showing the Arabic layout said PM where
 * the row behind it said م. Neither is a thing a control we own can get wrong:
 * the meridiem here comes from `clock12`, the same function every other time in
 * the app is formatted through, so the column and the row it edits cannot
 * disagree. It also drops a native dependency, and with it the stale-binary
 * crash that shipping one costs everybody once.
 *
 * Minutes are all sixty, so a clinic opening at 09:45 can say so. That was the
 * whole complaint against the half-hour `ui/Select` the platform picker replaced,
 * and it is not re-introduced by rounding the wheel to quarters.
 *
 * The wheel is a `ScrollView` per column rather than anything animated: snapping
 * to a row height is what a wheel is, `snapToInterval` already does it on the UI
 * thread, and the selected value is whichever row the scroll came to rest on.
 */
import { useState } from 'react';
import {
    type NativeScrollEvent,
    type NativeSyntheticEvent,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';
import { clock12 } from '../../../components/domain';
import { Chevron, Field } from '../../../components/ui';
import { useLocale } from '../../../shell/localeStore';
import { color, radius, size, space, Text } from '../../../theme';

/** One row of a column, and the unit `snapToInterval` counts in. */
const ROW = 44;
/** Odd, so there is a middle row for the selection to sit in. */
const VISIBLE = 5;
/** Empty rows above and below, so the first and last values can reach the middle. */
const PAD = ((VISIBLE - 1) / 2) * ROW;

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

type Parts = { hour: number; minute: number; pm: boolean };

function partsOf(minutes: number): Parts {
    const hours = Math.floor(minutes / 60);
    return { hour: hours % 12 === 0 ? 12 : hours % 12, minute: minutes % 60, pm: hours >= 12 };
}

function minutesOf({ hour, minute, pm }: Parts): number {
    // 12 AM is midnight and 12 PM is noon, so the 12 folds to 0 before the
    // afternoon's twelve hours are added — the one place a 12-hour clock is not
    // simply the 24-hour one modulo 12.
    return ((hour % 12) + (pm ? 12 : 0)) * 60 + minute;
}

export function formatClock(minutes: number, locale: 'en' | 'ar'): string {
    const { time, meridiem } = clock12(minutes, locale);
    return `${time} ${meridiem}`;
}

export type TimeFieldProps = {
    label: string;
    /** Minutes since midnight. */
    value: number;
    /** Asks the sheet holding this row to show the wheel. */
    onPress: () => void;
    hint?: string;
    error?: string;
    disabled?: boolean;
    testID?: string;
};

/** The row: what the time is now, and a way in. */
export function TimeField({ label, value, onPress, hint, error, disabled = false, testID }: TimeFieldProps) {
    const locale = useLocale();
    const shown = formatClock(value, locale);

    return (
        <Field label={label} hint={hint} error={error}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityValue={{ text: shown }}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={onPress}
                testID={testID}
                style={({ pressed }) => [
                    styles.control,
                    error ? styles.errored : null,
                    pressed && styles.pressed,
                    disabled && styles.disabled,
                ]}
            >
                <Text variant="body" numberOfLines={1} style={styles.value}>
                    {shown}
                </Text>
                <Chevron direction="down" />
            </Pressable>
        </Field>
    );
}

export type TimeWheelProps = {
    /** Minutes since midnight. Read once, on mount — the wheel owns it after that. */
    value: number;
    /** Every rest of every column, so the sheet's subtitle can follow along. */
    onChange: (minutes: number) => void;
};

/**
 * The three columns. It holds the answer itself rather than writing each scroll
 * through to the setting, so a column can move without the day being edited; the
 * sheet reads it back on Set.
 */
export function TimeWheel({ value, onChange }: TimeWheelProps) {
    const locale = useLocale();
    const markers = [clock12(0, locale).meridiem, clock12(12 * 60, locale).meridiem];

    const [parts, setParts] = useState<Parts>(() => partsOf(value));

    function move(next: Parts) {
        setParts(next);
        onChange(minutesOf(next));
    }

    return (
        <View style={styles.wheel}>
            {/* Behind the columns and untappable: it marks the middle row, it is
                not a control of its own. */}
            <View style={styles.band} pointerEvents="none" />

            <Column
                label="Hour"
                values={HOURS}
                format={String}
                index={HOURS.indexOf(parts.hour)}
                onIndex={(index) => move({ ...parts, hour: HOURS[index] ?? parts.hour })}
                testID="time-wheel-hour"
            />
            <Column
                label="Minute"
                values={MINUTES}
                format={(minute) => (minute < 10 ? `0${minute}` : String(minute))}
                index={parts.minute}
                onIndex={(index) => move({ ...parts, minute: index })}
                testID="time-wheel-minute"
            />
            <Column
                label="AM or PM"
                values={markers}
                format={(marker) => marker}
                index={parts.pm ? 1 : 0}
                onIndex={(index) => move({ ...parts, pm: index === 1 })}
                script="sans"
                testID="time-wheel-meridiem"
            />
        </View>
    );
}

type ColumnProps<T> = {
    label: string;
    values: readonly T[];
    format: (value: T) => string;
    index: number;
    onIndex: (index: number) => void;
    /** The meridiem is words, not figures, so it does not want the mono face. */
    script?: 'mono' | 'sans';
    testID?: string;
};

function Column<T>({ label, values, format, index, onIndex, script = 'mono', testID }: ColumnProps<T>) {
    /**
     * Both endings, because they are different gestures: a flick ends in
     * momentum, and a slow drag released mid-column ends without any. Reading
     * only the first leaves the wheel showing one value and holding another.
     */
    function rest(event: NativeSyntheticEvent<NativeScrollEvent>) {
        const landed = Math.round(event.nativeEvent.contentOffset.y / ROW);
        onIndex(Math.min(Math.max(landed, 0), values.length - 1));
    }

    return (
        <ScrollView
            accessibilityLabel={label}
            style={styles.column}
            contentContainerStyle={styles.columnContent}
            contentOffset={{ x: 0, y: index * ROW }}
            snapToInterval={ROW}
            decelerationRate="fast"
            disableIntervalMomentum
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            onMomentumScrollEnd={rest}
            onScrollEndDrag={rest}
            testID={testID}
        >
            {values.map((entry, at) => (
                <View key={format(entry)} style={styles.row}>
                    <Text
                        variant="title3"
                        script={script}
                        tone={at === index ? 'ink' : 'muted'}
                        weight={at === index ? 'semibold' : undefined}
                    >
                        {format(entry)}
                    </Text>
                </View>
            ))}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    control: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        minHeight: size.control,
        paddingHorizontal: space[3],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    value: { flex: 1 },
    errored: { borderColor: color.danger },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.32 },

    wheel: { flexDirection: 'row', height: VISIBLE * ROW, justifyContent: 'center' },
    band: {
        position: 'absolute',
        top: PAD,
        height: ROW,
        start: 0,
        end: 0,
        borderRadius: radius.md,
        backgroundColor: color.canvas,
    },
    column: { flex: 1, maxWidth: 96 },
    columnContent: { paddingVertical: PAD },
    row: { height: ROW, alignItems: 'center', justifyContent: 'center' },
});
