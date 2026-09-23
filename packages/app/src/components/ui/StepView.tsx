/**
 * The body of a stepped page, animated as the step changes: the new step fades
 * in while sliding a short way from the side the flow is heading. Only the
 * arriving step moves — the one leaving is gone on the same render — so the
 * page never holds two steps' fields at once, and a tap during the slide lands
 * on the step it can see.
 *
 * It owns no step state. The caller keeps its index and every answer, and this
 * only restarts the entrance when `index` changes; a mid-flight change stops
 * the old animation and starts from the new step's edge, so rapid Next/Back
 * cannot leave a step half-faded. Reduced motion runs it at duration 0.
 */
import type { ReactNode } from 'react';
// biome-ignore lint/style/noRestrictedImports: restarts the entrance `Animated.timing` when the step changes and reads the previous step to pick a side
import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useIsRTL } from '../../i18n';
import { duration, easing } from './motion';
import { stepDirection, stepOffset } from './stepTransition';
import { useReducedMotion } from './useReducedMotion';

export type StepViewProps = {
    /** The step on screen. A change of it is what plays the transition. */
    index: number;
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

export function StepView({ index, children, style, testID }: StepViewProps) {
    const isRTL = useIsRTL();
    const reducedMotion = useReducedMotion();
    // 1 is settled; the first step is already in place on mount.
    const progress = useRef(new Animated.Value(1)).current;
    const shown = useRef(index);
    const from = useRef(0);

    // Worked out during render so the new step's first frame is already at its
    // starting edge rather than flashing in place before the effect runs.
    if (shown.current !== index) {
        from.current = stepOffset(stepDirection(shown.current, index), isRTL);
        shown.current = index;
        progress.setValue(0);
    }

    // biome-ignore lint/correctness/useExhaustiveDependencies: `index` is the signal, not a value read — a new step is what restarts the entrance
    useEffect(() => {
        const animation = Animated.timing(progress, {
            toValue: 1,
            duration: reducedMotion ? 0 : duration.step,
            easing: easing.sheet,
            useNativeDriver: true,
        });
        animation.start();
        return () => animation.stop();
    }, [index, progress, reducedMotion]);

    return (
        <Animated.View
            style={[
                style,
                {
                    opacity: progress,
                    transform: [
                        {
                            translateX: progress.interpolate({
                                inputRange: [0, 1],
                                outputRange: [from.current, 0],
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
