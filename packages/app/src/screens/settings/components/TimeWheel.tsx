/**
 * Opening and closing time, on a wheel. The wheel library supplies the native-
 * animated cylinder projection; every visible row and the selection band stay
 * in the app so clock labels always follow the app locale.
 */
import WheelPicker, { type RenderItemProps } from '@quidone/react-native-wheel-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { clock12 } from '../../../components/domain';
import { Chevron, Field } from '../../../components/ui';
import { useLocale } from '../../../shell/localeStore';
import { color, radius, size, space, Text } from '../../../theme';

const ROW = 44;
const VISIBLE = 5;
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

function digits({ item }: RenderItemProps<Slot>) {
    return (
        <Text variant="title3" script="mono">
            {item.label}
        </Text>
    );
}

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
        top: '50%',
        marginTop: -ROW / 2,
        height: ROW,
        start: 0,
        end: 0,
        borderRadius: radius.md,
        backgroundColor: color.canvas,
    },
});
