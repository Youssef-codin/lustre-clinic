/**
 * The three columns that edit a clock time: hour, minute, meridiem.
 *
 * **The wheel is `@quidone/react-native-wheel-picker`, not ours.** A snapping
 * `ScrollView` (`4f42af1`) got the value right and felt like nothing — flat rows
 * under a band, no weight to a fling, a hard swipe moving four rows. The library
 * projects each row onto a cylinder — per-row rotation, vertical
 * foreshortening, an opacity ramp — off the native animation on the scroll
 * offset, and that projection is the whole feel of a picker. It has no native
 * side, so it costs no rebuild. Only the mechanics are the library's: every row
 * is our `Text` through `renderItem`, and the band is drawn here because the
 * library's overlay is per column and would leave gutters between three of them.
 *
 * The meridiem column's labels come from `clock12`, the function every other
 * time in the app is formatted through, so the column and the row it edits
 * cannot disagree — the platform dialog this replaced drew the OS locale's
 * AM/PM beside a row that said م.
 *
 * **The columns are virtualized, and that is not a nicety.** The library's
 * default list mounts every datum and gives each row an `Animated.View` with
 * animated opacity, `rotateX` and `translateY`: seventy-four rotated,
 * alpha-blended layers re-rasterised every frame. On the emulator that pinned
 * `RenderThread` at 99% and one swipe took ninety-five seconds to move a row.
 * `withVirtualized` at `windowSize={3}` mounts about fifteen rows a column —
 * and that alone was not enough: on Waydroid the first fling still pinned
 * `RenderThread` and raised an ANR. `Row` below is the other half.
 *
 * `_enableSyncScrollAfterScrollEnd` is off for a related reason: it re-issues
 * `scrollToIndex` after every scroll, which against a `FlatList` never reports
 * an end on Android, so the resync re-arms itself and the column scrolls for
 * ever. The effect keyed on `value` still scrolls a column when it changes.
 */
import BaseWheelPicker, {
    type RenderItemContainerProps,
    type RenderItemProps,
    usePickerItemHeight,
    useScrollContentOffset,
    withVirtualized,
} from '@quidone/react-native-wheel-picker';
import { memo, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { clock12 } from '../../../components/domain';
import { useLocale } from '../../../i18n';
import { color, radius, Text } from '../../../theme';

const WheelPicker = withVirtualized(BaseWheelPicker);

/** The row the band is cut to, and what the library projects the cylinder from. */
const ROW = 44;
/** Odd, so there is a middle row for the selection to sit in. */
const VISIBLE = 5;
const WINDOW = 3;
const COLUMN = 84;

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
    // 12 AM is midnight and 12 PM is noon, so the 12 folds to 0 before the
    // afternoon's twelve hours are added.
    return ((hour % 12) + (pm ? 12 : 0)) * 60 + minute;
}

export type TimeWheelProps = {
    /** Minutes since midnight. Read once, on mount — the wheel owns it after that. */
    value: number;
    /** Every row that passes under the band, so the sheet's subtitle can follow along. */
    onChange: (minutes: number) => void;
};

export function TimeWheel({ value, onChange }: TimeWheelProps) {
    const locale = useLocale();
    const meridiems = useMemo<Slot[]>(
        () => [
            { value: 0, label: clock12(0, locale).meridiem },
            { value: 1, label: clock12(12 * 60, locale).meridiem },
        ],
        [locale],
    );

    /**
     * Two copies of the time, because the library's two events disagree.
     *
     * `onValueChanging` comes straight off the scroll offset — the row under the
     * band — and is always right. `onValueChanged` waits for the scroll to end,
     * and Android does not report the end of the animated `scrollToIndex` a tap
     * on a row starts: the library infers it from a debounce, which can miss, and
     * the column then settled on 45 while the sheet said, and Set saved, 9:44. So
     * `live` follows the offset and is what the caller hears.
     *
     * `parts` is what the columns are told, and moves only when one comes to
     * rest. Feeding it every row a fling passes would hand the library a new
     * `value` mid-scroll, and it answers a new `value` with a `scrollToIndex` —
     * the column fighting the finger.
     */
    const live = useRef<Parts>(partsOf(value));
    const [parts, setParts] = useState<Parts>(live.current);

    function track(next: Parts) {
        live.current = next;
        onChange(minutesOf(next));
    }

    function settle(next: Parts) {
        track(next);
        setParts(next);
    }

    const column = {
        renderOverlay: null,
        windowSize: WINDOW,
        _enableSyncScrollAfterScrollEnd: false,
        itemHeight: ROW,
        visibleItemCount: VISIBLE,
        width: COLUMN,
        enableScrollByTapOnItem: true,
        renderItemContainer: row,
    } as const;

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
                <WheelPicker
                    {...column}
                    data={HOURS}
                    value={parts.hour}
                    onValueChanging={({ item }) => track({ ...live.current, hour: item.value })}
                    onValueChanged={({ item }) => settle({ ...live.current, hour: item.value })}
                    renderItem={digits}
                    testID="time-wheel-hour"
                />
                <WheelPicker
                    {...column}
                    data={MINUTES}
                    value={parts.minute}
                    onValueChanging={({ item }) => track({ ...live.current, minute: item.value })}
                    onValueChanged={({ item }) => settle({ ...live.current, minute: item.value })}
                    renderItem={digits}
                    testID="time-wheel-minute"
                />
            </View>
            <WheelPicker
                {...column}
                data={meridiems}
                value={parts.pm ? 1 : 0}
                onValueChanging={({ item }) => track({ ...live.current, pm: item.value === 1 })}
                onValueChanged={({ item }) => settle({ ...live.current, pm: item.value === 1 })}
                renderItem={words}
                testID="time-wheel-meridiem"
            />
        </View>
    );
}

/**
 * The library's own row container, with one difference: the row is drawn into
 * a hardware texture once and the scroll only moves, tilts and fades that
 * texture, rather than re-rasterising the text under a 3D transform and an
 * alpha every frame. Measured on Waydroid, the fling that raised an ANR with
 * the library's container carried twenty-eight rows and settled, with
 * `RenderThread` near 20%.
 */
const Row = memo(function Row({
    listRef,
    item,
    index,
    faces,
    renderItem,
    itemTextStyle,
}: RenderItemContainerProps<Slot>) {
    const offset = useScrollContentOffset();
    const height = usePickerItemHeight();
    const motion = useMemo(() => {
        const inputRange = faces.map((face) => height * (index + face.index));
        return {
            opacity: offset.interpolate({
                inputRange,
                outputRange: faces.map((face) => face.opacity),
                extrapolate: 'clamp',
            }),
            rotateX: offset.interpolate({ inputRange, outputRange: faces.map((face) => `${face.deg}deg`) }),
            translateY: offset.interpolate({ inputRange, outputRange: faces.map((face) => face.offsetY) }),
        };
    }, [faces, height, index, offset]);

    return (
        <Pressable onPress={() => listRef.current?.scrollToIndex({ index, animated: true })}>
            <Animated.View
                renderToHardwareTextureAndroid
                style={{
                    height,
                    opacity: motion.opacity,
                    transform: [
                        { translateY: motion.translateY },
                        { rotateX: motion.rotateX },
                        { perspective: 1000 },
                    ],
                }}
            >
                {renderItem({ item, index, itemTextStyle })}
            </Animated.View>
        </Pressable>
    );
});

function row({ key, ...props }: RenderItemContainerProps<Slot>) {
    return <Row key={key} {...props} />;
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
    wheel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    figure: { flexDirection: 'row', direction: 'ltr' },
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
