import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { color, radius } from '../../theme';
import { PULSE } from './motion';
import { useReducedMotion } from './useReducedMotion';

export type DotTone = 'live' | 'wa' | 'due' | 'danger' | 'accent' | 'success' | 'muted';

export type DotProps = {
    tone?: DotTone;
    size?: number;
    pulse?: boolean;
};

const TONE: Record<DotTone, string> = {
    live: color.live,
    wa: color.wa,
    due: color.due,
    danger: color.danger,
    accent: color.accent,
    success: color.success,
    muted: color.muted,
};

export function Dot({ tone = 'muted', size = 6, pulse = false }: DotProps) {
    const opacity = useRef(new Animated.Value(1)).current;
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        if (!pulse || reducedMotion) {
            opacity.setValue(1);
            return;
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: PULSE.min,
                    duration: PULSE.duration,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, { toValue: 1, duration: PULSE.duration, useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [pulse, reducedMotion, opacity]);

    return (
        <Animated.View
            style={[styles.dot, { width: size, height: size, backgroundColor: TONE[tone], opacity }]}
        />
    );
}

const styles = StyleSheet.create({
    dot: { borderRadius: radius.full },
});
