// The debtor search. It rests in the list, above the first row, and sticks to
// the bottom of the screen whenever that slot would fall below it — so the
// control is reachable while you are scrolling the list it filters, and settles
// into the list once you have scrolled to it.
//
// It is an overlay on the screen rather than a sticky element in the scroller:
// the resting position is driven from the anchor's measured offset, which the
// screen owns because only the screen knows the scroll position. Anything that
// keeps the pill inside the scroller has its docked offset clamped by the
// scroller's own padding instead of by the bottom of the screen.
//
// **There is no docked/resting state, and that is the point.** Both the
// position and the surface come from one clamped `Animated` node driven by the
// scroll on the native thread. The earlier version kept a JS copy of the scroll
// offset to decide a `docked` boolean while the transform used the native
// value; a flung scroll drops its last JS event, so the two disagreed and the
// pill was positioned for a scroll position that was no longer true — it went
// off the bottom of the screen and stayed there. One source cannot disagree
// with itself.
//
// Position is a `translateY`, never `top`: `top` is a layout property, so it
// cannot go on the native driver, and the pill then lags the content on a flick
// and snaps level when the scroll settles, which reads as an ease nobody asked
// for.
import type { Animated as RNAnimated } from 'react-native';
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Placeholder } from '../../../components/ui';
import { color, containsArabic, font, radius, shadow, size, space, Text, type } from '../../../theme';
import { SearchIcon } from './icons';

export const SEARCH_HEIGHT = 56;

const CLEAR = 22;

export type DockedSearchProps = {
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
    /** Position, clamped so the pill can never fall past the dock line. */
    translateY: RNAnimated.AnimatedInterpolation<number>;
    /** 0 resting in the list, 1 floating over it. Drives the lift, not the box. */
    dockOpacity: RNAnimated.AnimatedInterpolation<number>;
    /** The pill's own rise as it lifts off the list. */
    dockScale: RNAnimated.AnimatedInterpolation<number>;
};

export function DockedSearch({
    value,
    onChangeText,
    placeholder,
    translateY,
    dockOpacity,
    dockScale,
}: DockedSearchProps) {
    const arabic = containsArabic(value || placeholder);

    return (
        <Animated.View style={[styles.pill, { transform: [{ translateY }, { scale: dockScale }] }]}>
            {/* The lift, drawn as its own layer so the shadow can fade: a
                shadow is not an animatable property, but the view carrying it
                is. Same box, so the control never changes size — it rises off
                the list rather than growing out of it. */}
            <Animated.View style={[styles.dockedSurface, { opacity: dockOpacity }]} pointerEvents="none" />

            <SearchIcon size={20} />

            <View style={styles.inputWrap}>
                <TextInput
                    value={value}
                    onChangeText={onChangeText}
                    accessibilityLabel={placeholder}
                    accessibilityRole="search"
                    returnKeyType="search"
                    autoCorrect={false}
                    style={[styles.input, { fontFamily: arabic ? font.arabic.regular : font.sans.regular }]}
                    testID="money-debtor-search"
                />
                <Placeholder text={placeholder} visible={value === ''} />
            </View>

            {value.length > 0 ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    hitSlop={10}
                    onPress={() => onChangeText('')}
                    style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
                >
                    <Text variant="caption" weight="bold" tone="inverse">
                        ✕
                    </Text>
                </Pressable>
            ) : null}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    // White with a hairline, like every other card on this screen. The design
    // rests this pill on `surface-2` because its page is white; ours is the
    // grey `canvas`, where the same grey is invisible — the relationship the
    // design draws is "a shade away from the page", not "this exact grey".
    pill: {
        position: 'absolute',
        top: 0,
        start: 0,
        end: 0,
        zIndex: 3,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2.5],
        height: SEARCH_HEIGHT,
        marginHorizontal: size.bleed,
        paddingHorizontal: space[4],
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
    dockedSurface: {
        position: 'absolute',
        top: -1,
        bottom: -1,
        start: -1,
        end: -1,
        borderRadius: radius.full,
        backgroundColor: color.surface,
        boxShadow: shadow.dock,
    },
    inputWrap: { flex: 1, justifyContent: 'center' },
    input: { ...type.body, alignSelf: 'stretch', color: color.ink, paddingVertical: space[2] },
    clear: {
        width: CLEAR,
        height: CLEAR,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        backgroundColor: color.muted,
    },
    pressed: { opacity: 0.6 },
});
