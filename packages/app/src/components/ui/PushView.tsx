/**
 * The list → form transition in both settings editors: an absolutely positioned
 * sibling that slides in from the inline edge and covers the list. Mirrors in
 * Arabic, because a form that arrives from the wrong side reads as going back.
 * Not a navigator — it is one screen showing one of two panes, which keeps the
 * list's scroll position while a row is edited.
 */
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, I18nManager, StyleSheet, useWindowDimensions } from 'react-native';
import { color } from '../../theme';
import { duration, easing } from './motion';
import { useReducedMotion } from './useReducedMotion';

export type PushViewProps = {
    visible: boolean;
    children: ReactNode;
    testID?: string;
};

export function PushView({ visible, children, testID }: PushViewProps) {
    const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
    const [mounted, setMounted] = useState(visible);
    const reducedMotion = useReducedMotion();
    const window = useWindowDimensions();

    useEffect(() => {
        if (visible) setMounted(true);
        const animation = Animated.timing(progress, {
            toValue: visible ? 1 : 0,
            duration: reducedMotion ? 0 : duration.push,
            easing: easing.sheet,
            useNativeDriver: true,
        });
        animation.start(({ finished }) => {
            if (finished && !visible) setMounted(false);
        });
        return () => animation.stop();
    }, [visible, progress, reducedMotion]);

    if (!mounted) return null;

    const offscreen = I18nManager.isRTL ? -window.width : window.width;

    return (
        <Animated.View
            style={[
                styles.pane,
                {
                    transform: [
                        {
                            translateX: progress.interpolate({
                                inputRange: [0, 1],
                                outputRange: [offscreen, 0],
                            }),
                        },
                    ],
                },
            ]}
            testID={testID}
        >
            {children}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    pane: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, backgroundColor: color.canvas },
});
