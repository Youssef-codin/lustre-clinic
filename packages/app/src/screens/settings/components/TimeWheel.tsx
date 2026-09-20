/**
 * Opening and closing time, on a wheel. The wheel library supplies the native-
 * animated cylinder projection; every visible row and the selection band stay
 * in the app so clock labels always follow the app locale.
 *
 * **The columns are virtualized, and that is not a nicety.** The library's
 * default list mounts every datum — `data.map(...)`, `removeClippedSubviews`
 * off — and gives each row an `Animated.View` carrying three interpolations off
 * the native scroll offset: opacity, `rotateX` and `translateY`. An animated
 * opacity on a view group is an offscreen `saveLayer` and a 3D rotate is a
 * render layer, so the sixty minutes plus twelve hours plus two meridiems came
 * to seventy-four rotated, alpha-blended layers re-rasterised every frame. On
 * the emulator that pinned `RenderThread` at 99% for the length of a scroll and
 * took the UI thread down with it: one 250px swipe moved the column one row and
 * took ninety-five seconds, with `Input dispatching timed out` every five.
 * `withVirtualized` at `windowSize={3}` mounts about fifteen rows a column
 * instead, and the same swipe now settles in a frame or two.
 *
 * `_enableSyncScrollAfterScrollEnd` is off for the same reason in a different
 * place. It re-issues `scrollToIndex` a beat after every scroll ends to pull a
 * column back onto its value; against a `FlatList` that programmatic animated
 * scroll never reports an end on Android, so the resync re-arms itself and the
 * column scrolls for ever — `RenderThread` at 100% with no way back. Tapping a
 * row was enough to trigger it. Nothing is lost by turning it off: the effect
 * keyed on `valueIndex` still scrolls the column whenever `value` changes,
 * which is the path that makes the control controlled.
 */
import BaseWheelPicker, { type RenderItemProps, withVirtualized } from '@quidone/react-native-wheel-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { clock12 } from '../../../components/domain';
import { Chevron, Field } from '../../../components/ui';
import { useLocale } from '../../../i18n';
import { color, radius, size, space, Text } from '../../../theme';

const WheelPicker = withVirtualized(BaseWheelPicker);

const ROW = 44;
const VISIBLE = 5;
const WINDOW = 3;
const COLUMN = 92;

type Slot = { value: number; label: string };
type Parts = { hour: number; minute: number; pm: boolean };

const HOURS: Slot[] = Array.from({ length: 12 }, (_, index) => ({
    value: index + 1,
    label: String(index + 1),
}));
const MINUTES: Slot[] = Array.from({ length: 60 }, (_, index) => ({
    value: index,
    label: index < 10 ? `0${index}` : String(index),
}));

function partsOf(minutes: number): Parts {
    const hours = Math.floor(minutes / 60);
    return { hour: hours % 12 === 0 ? 12 : hours % 12, minute: minutes % 60, pm: hours >= 12 };
}

function minutesOf({ hour, minute, pm }: Parts): number {
    return ((hour % 12) + (pm ? 12 : 0)) * 60 + minute;
}

export function formatClock(minutes: number, locale: 'en' | 'ar'): string {
    const { time, meridiem } = clock12(minutes, locale);
    return `${time} ${meridiem}`;
}

export type TimeFieldProps = {
    label: string;
    value: number;
    onPress: () => void;
    hint?: string;
    error?: string;
    disabled?: boolean;
    testID?: string;
};

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
    value: number;
    onChange: (minutes: number) => void;
};

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
            <View style={styles.band} pointerEvents="none" />
            <WheelPicker
                data={HOURS}
                value={parts.hour}
                onValueChanged={({ item }) => move({ ...parts, hour: item.value })}
                renderItem={digits}
                renderOverlay={null}
                windowSize={WINDOW}
                _enableSyncScrollAfterScrollEnd={false}
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
                windowSize={WINDOW}
                _enableSyncScrollAfterScrollEnd={false}
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
                windowSize={WINDOW}
                _enableSyncScrollAfterScrollEnd={false}
                itemHeight={ROW}
                visibleItemCount={VISIBLE}
                width={COLUMN}
                enableScrollByTapOnItem
                testID="time-wheel-meridiem"
            />
        </View>
    );
}

function digits({ item }: RenderItemProps<Slot>) {
    return (
        <Text variant="title3" script="mono" style={styles.label}>
            {item.label}
        </Text>
    );
}

function words({ item }: RenderItemProps<Slot>) {
    return (
        <Text variant="title3" style={styles.label}>
            {item.label}
        </Text>
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
    label: { width: '100%', textAlign: 'center' },
    wheel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    band: {
        position: 'absolute',
        top: '50%',
        marginTop: -ROW / 2,
        height: ROW,
        start: 0,
        end: 0,
        borderRadius: radius.md,
        backgroundColor: color.canvas,
    },
});
