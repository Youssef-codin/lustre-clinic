import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The React Native equivalent of the `prefers-reduced-motion` block every design
 * ends with. Animations multiply their duration by 0 rather than being skipped,
 * so the end state still lands.
 */
export function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        let alive = true;
        AccessibilityInfo.isReduceMotionEnabled().then((value) => {
            if (alive) setReduced(value);
        });
        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
        return () => {
            alive = false;
            sub.remove();
        };
    }, []);

    return reduced;
}
