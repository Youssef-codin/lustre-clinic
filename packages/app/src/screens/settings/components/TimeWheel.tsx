/**
 * Opening and closing time, on a wheel: the row that shows a time (`TimeField`)
 * and the three columns that edit one (`TimeWheel`).
 *
 * **The wheel is `@quidone/react-native-wheel-picker`, not ours.** A snapping
 * `ScrollView` gets the value right and feels nothing like a wheel — flat rows
 * sliding under a band, no weight to the fling and no sense of a cylinder
 * turning. The library projects each row onto one: per-row rotation, vertical
 * foreshortening and an opacity ramp away from the centre, all driven by the
 * native animation on the scroll offset. That is the part that is hard to get
 * right by hand and the reason not to.
 *
 * It has no native side, which is the other reason: it is plain JS over
 * `ScrollView`, so it costs no rebuild and cannot repeat the stale-binary crash
 * the platform picker's native module did. Only the mechanics are the library's
 * — every row is our `Text` through `renderItem`, and the selection band is
 * drawn here rather than by the library's per-picker overlay, which would put
 * three of them side by side with gaps instead of one band across the row.
 *
 * **Why not the platform picker.** It was, and the trade it made no longer
 * holds. It came with `is24Hour: false` bolted on to stop the *device's*
 * 12/24-hour setting overriding the app's — an override that had to be right, in
 * the one control that edits a time — and it still drew its own AM/PM from the
 * OS locale, so an English-locale phone showing the Arabic layout said PM where
 * the row behind it said م. Neither is a thing a control we own can get wrong:
 * the meridiem here comes from `clock12`, the same function every other time in
 * the app is formatted through, so the column and the row it edits cannot
 * disagree.
 *
 * Minutes are all sixty, so a clinic opening at 09:45 can say so. That was the
 * whole complaint against the half-hour `ui/Select` the platform picker replaced,
 * and it is not re-introduced by rounding the wheel to quarters.
 *
 * `TimeField` and `TimeWheel` are two components rather than one control because
 * **the wheel cannot live in a sheet of its own.** The field it edits is already
 * inside the day editor's sheet, and a `Sheet` inside a `Sheet` does not open —
 * the outer one goes with it and both are gone. That is the same hazard
 * `AppointmentDetailSheet` met with its destructive confirms, and this is the
 * same answer: the wheel is drawn *in* the sheet that asked for it, in place of
 * the form, with the footer swapped for its own Set and Cancel. One sheet, two
 * faces.
 */
import WheelPicker, { type RenderItemProps } from '@quidone/react-native-wheel-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { clock12 } from '../../../components/domain';
import { Chevron, Field } from '../../../components/ui';
import { useLocale } from '../../../shell/localeStore';
import { color, radius, size, space, Text } from '../../../theme';

/** The row the band is cut to, and what the library projects the cylinder from. */
const ROW = 44;
/** Odd, so there is a middle row for the selection to sit in. */
const VISIBLE = 5;

type Slot = { value: number; label: string };

const HOURS: Slot[] = Array.from({ length: 12 }, (_, index) => ({
    value: index + 1,
    label: String(index + 1),
}));
const MINUTES: Slot[] = Array.from({ length: 60 }, (_, index) => ({
    value: index,
    label: index < 10 ? `0${index}` : String(index),
}));

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
    /** Each column coming to rest, so the sheet's subtitle can follow along. */
    onChange: (minutes: number) => void;
};

/**
 * The three columns. It holds the answer itself rather than writing each rest
 * through to the setting, so a column can move without the day being edited; the
 * sheet reads it back on Set.
 */
export function TimeWheel({ value, onChange }: TimeWheelProps) {
    const locale = useLocale();
    const meridiems: Slot[] = [
        { value: 0, label: clock12(0, locale).meridiem },
        { value: 1, label: clock12(12 * 60, locale).meridiem },
    ];

    const [parts, setParts] = useState<Parts>(() => partsOf(value));

    function move(next: Parts) {
        setParts(next);
        onChange(minutesOf(next));
    }

    return (
        <View style={styles.wheel}>
            {/* One band across all three columns, drawn before them so it sits
                behind. The library's own overlay is per picker, which would draw
                three of these with the gutters showing between them. */}
            <View style={styles.band} pointerEvents="none" />

            <WheelPicker
                data={HOURS}
                value={parts.hour}
                onValueChanged={({ item }) => move({ ...parts, hour: item.value })}
                renderItem={digits}
                renderOverlay={null}
                itemHeight={ROW}
                visibleItemCount={VISIBLE}
                width={COLUMN}
                enableScrollByTapOnItem
                testID="time-wheel-hour"
            />
            <WheelPicker
                data={MINUTES}
                value={parts.minute}
                onValueChanged={({ item }) => move({ ...parts, minute: item.value })}
                renderItem={digits}
                renderOverlay={null}
                itemHeight={ROW}
                visibleItemCount={VISIBLE}
                width={COLUMN}
                enableScrollByTapOnItem
                testID="time-wheel-minute"
            />
            <WheelPicker
                data={meridiems}
                value={parts.pm ? 1 : 0}
                onValueChanged={({ item }) => move({ ...parts, pm: item.value === 1 })}
                renderItem={words}
                renderOverlay={null}
                itemHeight={ROW}
                visibleItemCount={VISIBLE}
                width={COLUMN}
                enableScrollByTapOnItem
                testID="time-wheel-meridiem"
            />
        </View>
    );
}

const COLUMN = 92;

/**
 * Every row is drawn at full strength: the wheel's own opacity ramp is what
 * fades the ones away from the centre, and toning them down here as well would
 * fade them twice.
 */
function digits({ item }: RenderItemProps<Slot>) {
    return (
        <Text variant="title3" script="mono">
            {item.label}
        </Text>
    );
}

/** The meridiem is words, not figures, so it does not want the mono face. */
function words({ item }: RenderItemProps<Slot>) {
    return <Text variant="title3">{item.label}</Text>;
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

    wheel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    band: {
        position: 'absolute',
        // Measured from the middle rather than from a height of our own: the
        // picker works its height out from the cylinder, not from rows × height.
        top: '50%',
        marginTop: -ROW / 2,
        height: ROW,
        start: 0,
        end: 0,
        borderRadius: radius.md,
        backgroundColor: color.canvas,
    },
});
