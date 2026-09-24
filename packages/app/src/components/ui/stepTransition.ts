/**
 * The arithmetic under `StepView`, kept free of `react-native` so it can be
 * tested on its own. A step arrives from the side the flow is heading: forward
 * comes in from the inline end, back from the inline start — mirrored in
 * Arabic, where the inline end is on the left.
 */

/** How far, in dp, an arriving step starts from where it lands. */
export const STEP_SHIFT = 24;

export type StepDirection = 'forward' | 'back' | 'none';

export function stepDirection(from: number, to: number): StepDirection {
    if (to > from) return 'forward';
    if (to < from) return 'back';
    return 'none';
}

/** Where the arriving step starts on the x axis; 0 when it only fades. */
export function stepOffset(direction: StepDirection, isRTL: boolean): number {
    if (direction === 'none') return 0;
    const shift = direction === 'forward' ? STEP_SHIFT : -STEP_SHIFT;
    return isRTL ? -shift : shift;
}
