/**
 * The three columns that edit a clock time: hour, minute, meridiem.
 *
 * **Each column is ours, on Reanimated and Gesture Handler — not a
 * `ScrollView`.** A snapping `ScrollView` (`4f42af1`) felt like nothing, and
 * `@quidone/react-native-wheel-picker` on top of one felt wrong in a way no
 * prop could fix: with snap offsets, Android's `ReactScrollView.flingAndSnap`
 * picks the row to land on, boosts the fling's velocity, and hands `OverScroller`
 * that row as both bounds — so the column runs at full speed and is cut off
 * at the row. Here the finger moves the column one to one, and on release the
 * landing row is projected from the velocity and reached along a single
 * exponential ease-out whose opening speed is the finger's, which is how the
 * iOS picker glides to a stop. Both libraries are already in the APK, so this
 * stays an OTA change.
 *
 * Rows are projected onto a cylinder — per-row rotation, the translation that
 * foreshortens the spacing, an opacity ramp — on the UI thread, off the one
 * shared offset. The band is drawn here, once across all three columns.
 *
 * **Hours and minutes loop by wrapping.** The offset is unbounded, and a row's
 * distance from the band is taken modulo the column's length, so 12 runs on
 * to 1 and 59 to 00 with no seam. The meridiem column has two rows and a
 * rubber-band at each end instead.
 *
 * Each row that passes under the band ticks, the way the iOS picker does,
 * through React Native's own `Vibration` rather than `expo-haptics`: a native
 * module would change the fingerprint and turn this into a new APK, and every
 * installed build already holds `VIBRATE`. iOS ignores the duration and buzzes
 * for its fixed length; the clinic runs Android.
 *
 * The meridiem column's labels come from `clock12`, the function every other
 * time in the app is formatted through, so the column and the row it edits
 * cannot disagree — the platform dialog this replaced drew the OS locale's
 * AM/PM beside a row that said م.
 */
import { memo, useMemo, useRef, useState } from 'react';
import { StyleSheet, Vibration, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    cancelAnimation,
    Extrapolation,
    interpolate,
    type SharedValue,
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { clock12 } from '../../../components/domain';
import { useLocale } from '../../../i18n';
import { color, radius, Text } from '../../../theme';

/** The row the band is cut to. */
const ROW = 44;
/** Odd, so there is a middle row for the selection to sit in. */
const VISIBLE = 5;
const HEIGHT = ROW * VISIBLE;
const COLUMN = 84;

/** The angle between neighbouring rows on the cylinder, and the radius that keeps them `ROW` apart at the band. */
const STEP_DEG = 20;
const RADIUS = ROW / ((STEP_DEG * Math.PI) / 180);
/** Rows further than this from the band are not drawn. */
const REACH = 2.6;

/**
 * How far a release carries: the glide's time constant, in ms. A fling covers
 * its velocity times this. The iOS picker sits between `UIScrollView`'s normal
 * and fast rates; 200 ms lands a firm flick about a dozen rows on.
 */
const GLIDE_MS = 200;
/** The glide runs this many time constants, by which it is within 1% of the row. */
const GLIDE_SPAN = 5;
/** The bounds on one glide's time constant, so a nudge still eases and a hard fling still ends. */
const GLIDE_MIN_MS = 60;
const GLIDE_MAX_MS = 600;
/** Past the meridiem column's ends, the column follows the finger this much. */
const STRETCH = 0.35;
/** Long enough for a phone's motor to register, short enough to read as a tick. */
const TICK_MS = 10;

type Parts = { hour: number; minute: number; pm: boolean };

const HOURS = Array.from({ length: 12 }, (_, slot) => String(slot + 1));
const MINUTES = Array.from({ length: 60 }, (_, slot) => (slot < 10 ? `0${slot}` : String(slot)));

function partsOf(minutes: number): Parts {
    const hours = Math.floor(minutes / 60);
    return { hour: hours % 12 === 0 ? 12 : hours % 12, minute: minutes % 60, pm: hours >= 12 };
}

function minutesOf({ hour, minute, pm }: Parts): number {
    // 12 AM is midnight and 12 PM is noon, so the 12 folds to 0 before the
    // afternoon's twelve hours are added.
    return ((hour % 12) + (pm ? 12 : 0)) * 60 + minute;
}

/**
 * How many times the hour column crossed between 11 and 12 moving from row `a`
 * to row `b`. Counted rather than compared, because a fling can carry the
 * column more than one row between two frames.
 */
function noonCrossings(a: number, b: number): number {
    // Row `r` shows 12 when `r % 12 === 11`; each such row entered or left is a crossing.
    const twelves = (row: number) => Math.floor((row + 1) / 12);
    return Math.abs(twelves(b) - twelves(a));
}

function tick() {
    Vibration.vibrate(TICK_MS);
}

function wrap(value: number, length: number): number {
    'worklet';
    return ((value % length) + length) % length;
}

/** An exponential ease-out over `GLIDE_SPAN` time constants, stretched to end exactly on 1. */
function glide(t: number): number {
    'worklet';
    return (1 - Math.exp(-GLIDE_SPAN * t)) / (1 - Math.exp(-GLIDE_SPAN));
}

export type TimeWheelProps = {
    /** Minutes since midnight. Read once, on mount — the wheel owns it after that. */
    value: number;
    /** Every row that passes under the band, so the sheet's subtitle can follow along. */
    onChange: (minutes: number) => void;
};

export function TimeWheel({ value, onChange }: TimeWheelProps) {
    const locale = useLocale();
    const meridiems = useMemo(
        () => [clock12(0, locale).meridiem, clock12(12 * 60, locale).meridiem],
        [locale],
    );

    const [parts, setParts] = useState<Parts>(() => partsOf(value));
    /** `parts` as of the last event, which a handler reads before React has re-rendered. */
    const live = useRef(parts);
    /** The hour column's row under the band, to tell which way it last crossed 12. */
    const hourRow = useRef(parts.hour - 1);

    function update(next: Parts) {
        live.current = next;
        setParts(next);
        onChange(minutesOf(next));
    }

    function changing(next: Parts) {
        tick();
        update(next);
    }

    /**
     * The hour column carries the meridiem the way the iOS picker does: passing
     * 11 → 12 in either direction flips AM and PM, and the meridiem column,
     * handed its new index, rolls over on its own.
     */
    function hourChanging(slot: number, row: number) {
        const flips = noonCrossings(hourRow.current, row) % 2 === 1;
        hourRow.current = row;
        changing({ ...live.current, hour: slot + 1, pm: flips ? !live.current.pm : live.current.pm });
    }

    return (
        <View style={styles.wheel}>
            <View style={styles.band} pointerEvents="none" />
            {/*
             * Hour then minute, left to right, in both languages: they are the
             * Latin digits of `6:00`, which read that way inside Arabic too.
             * Only the meridiem follows the layout — after the figure in
             * English, before it in Arabic — the same as `TimeValue`'s row.
             */}
            <View style={styles.figure}>
                <Column
                    labels={HOURS}
                    index={parts.hour - 1}
                    loop
                    mono
                    onChanging={hourChanging}
                    onChanged={(slot) => update({ ...live.current, hour: slot + 1 })}
                    testID="time-wheel-hour"
                />
                <Column
                    labels={MINUTES}
                    index={parts.minute}
                    loop
                    mono
                    onChanging={(slot) => changing({ ...live.current, minute: slot })}
                    onChanged={(slot) => update({ ...live.current, minute: slot })}
                    testID="time-wheel-minute"
                />
            </View>
            <Column
                labels={meridiems}
                index={parts.pm ? 1 : 0}
                loop={false}
                mono={false}
                onChanging={(slot) => changing({ ...live.current, pm: slot === 1 })}
                onChanged={(slot) => update({ ...live.current, pm: slot === 1 })}
                testID="time-wheel-meridiem"
            />
        </View>
    );
}

type ColumnProps = {
    labels: readonly string[];
    /** The selected slot. A change the column did not make itself — the meridiem flipping — rolls it there. */
    index: number;
    loop: boolean;
    mono: boolean;
    /** Every row that passes under the band: its slot, and the unwrapped row it was reached on. */
    onChanging: (slot: number, row: number) => void;
    /** The slot a glide came to rest on. */
    onChanged: (slot: number) => void;
    testID: string;
};

function Column({ labels, index, loop, mono, onChanging, onChanged, testID }: ColumnProps) {
    const count = labels.length;
    const last = (count - 1) * ROW;
    /** Distance scrolled, in px. Row `r` is under the band at `r * ROW`; unbounded when the column loops. */
    const offset = useSharedValue(index * ROW);
    const grabbed = useSharedValue(0);
    /** From touch-down until a glide comes to rest, when an outside `index` must not move the column. */
    const busy = useSharedValue(false);

    const slotOf = (row: number) => {
        'worklet';
        return loop ? wrap(row, count) : Math.min(Math.max(row, 0), count - 1);
    };

    const settleTo = (target: number, velocity: number) => {
        'worklet';
        const distance = target - offset.value;
        // The time constant that makes the glide open at the finger's speed.
        // A release against the direction of travel, or none at all, eases in
        // from rest instead.
        const matched = velocity !== 0 && Math.sign(velocity) === Math.sign(distance);
        const constant = matched ? (distance / velocity) * 1000 : GLIDE_MIN_MS;
        const clamped = Math.min(Math.max(constant, GLIDE_MIN_MS), GLIDE_MAX_MS);
        busy.value = true;
        offset.value = withTiming(target, { duration: clamped * GLIDE_SPAN, easing: glide }, (finished) => {
            if (!finished) return;
            busy.value = false;
            scheduleOnRN(onChanged, slotOf(Math.round(target / ROW)));
        });
    };

    useAnimatedReaction(
        () => Math.round(offset.value / ROW),
        (row, previous) => {
            if (previous === null || slotOf(row) === slotOf(previous)) return;
            scheduleOnRN(onChanging, slotOf(row), row);
        },
    );

    useAnimatedReaction(
        () => index,
        (next) => {
            if (busy.value) return;
            const row = Math.round(offset.value / ROW);
            const current = slotOf(row);
            if (current === next) return;
            // The shorter way round, when the column loops.
            const delta = loop ? wrap(next - current + count / 2, count) - count / 2 : next - current;
            settleTo((row + delta) * ROW, 0);
        },
        [index],
    );

    const pan = Gesture.Pan()
        .onBegin(() => {
            // A touch stops a gliding column where it is, as on iOS.
            cancelAnimation(offset);
            busy.value = true;
            grabbed.value = offset.value;
        })
        .onUpdate((event) => {
            const raw = grabbed.value - event.translationY;
            if (loop) {
                offset.value = raw;
            } else if (raw < 0) {
                offset.value = raw * STRETCH;
            } else if (raw > last) {
                offset.value = last + (raw - last) * STRETCH;
            } else {
                offset.value = raw;
            }
        })
        .onFinalize((event, success) => {
            let row: number;
            let velocity = 0;
            if (success) {
                velocity = -event.velocityY;
                row = Math.round((offset.value + (velocity * GLIDE_MS) / 1000) / ROW);
            } else {
                // A touch that never moved is a tap: to the row under it.
                row = Math.round(offset.value / ROW) + Math.round((event.y - HEIGHT / 2) / ROW);
            }
            const target = loop ? row * ROW : Math.min(Math.max(row * ROW, 0), last);
            settleTo(target, velocity);
        });

    return (
        <GestureDetector gesture={pan}>
            <View style={styles.column} testID={testID}>
                {labels.map((label, slot) => (
                    <Row
                        key={slot}
                        label={label}
                        slot={slot}
                        count={count}
                        loop={loop}
                        mono={mono}
                        offset={offset}
                    />
                ))}
            </View>
        </GestureDetector>
    );
}

type RowProps = {
    label: string;
    slot: number;
    count: number;
    loop: boolean;
    mono: boolean;
    offset: SharedValue<number>;
};

/**
 * One row, placed on the cylinder by its distance from the band. The row is
 * drawn into a hardware texture once, and the scroll only moves, tilts and
 * fades that texture rather than re-rasterising the text every frame.
 */
const Row = memo(function Row({ label, slot, count, loop, mono, offset }: RowProps) {
    const placed = useAnimatedStyle(() => {
        const away = slot - offset.value / ROW;
        const distance = loop ? wrap(away + count / 2, count) - count / 2 : away;
        const angle = Math.max(-90, Math.min(90, distance * STEP_DEG));
        return {
            opacity: interpolate(
                Math.abs(distance),
                [0, 1, 2, REACH],
                [1, 0.5, 0.22, 0],
                Extrapolation.CLAMP,
            ),
            transform: [
                { perspective: 1000 },
                { translateY: RADIUS * Math.sin((angle * Math.PI) / 180) },
                { rotateX: `${-angle}deg` },
            ],
        };
    });

    return (
        <Animated.View style={[styles.row, placed]} renderToHardwareTextureAndroid>
            <Text variant="title3" script={mono ? 'mono' : undefined} style={styles.label}>
                {label}
            </Text>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    wheel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    figure: { flexDirection: 'row', direction: 'ltr' },
    column: { width: COLUMN, height: HEIGHT, overflow: 'hidden' },
    row: {
        position: 'absolute',
        top: (HEIGHT - ROW) / 2,
        start: 0,
        end: 0,
        height: ROW,
        justifyContent: 'center',
    },
    label: { width: '100%', textAlign: 'center' },
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
