import type { Animated as AnimatedTypes } from 'react-native';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { color } from '../../theme';

export type ScrimProps = {
    /** Drive from the same value as the thing it sits behind. */
    opacity?: AnimatedTypes.AnimatedInterpolation<number> | AnimatedTypes.Value;
    onPress?: () => void;
    /** Read out by screen readers when the scrim is the way out. */
    closeLabel?: string;
};

export function Scrim({ opacity, onPress, closeLabel = 'Close' }: ScrimProps) {
    return (
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, opacity ? { opacity } : null]}>
            <Pressable
                style={StyleSheet.absoluteFill}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={closeLabel}
                // Nothing behind the scrim is reachable, so it must not be
                // reachable by a swipe either.
                accessibilityViewIsModal
            />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    scrim: { backgroundColor: color.scrim },
});
