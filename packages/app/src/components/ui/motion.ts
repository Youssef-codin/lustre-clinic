import { Easing } from 'react-native';

// Component Inventory §3.4. The theme is values-only and deliberately holds no
// motion, so the curves live with the components that animate. Durations are ms.
//
// Every design ends with a `prefers-reduced-motion` block. React Native exposes
// the same signal through `AccessibilityInfo.isReduceMotionEnabled()`; the
// components here read it via `useReducedMotion` and fall through to duration 0
// rather than skipping the animation, so the end state is always applied.

export const duration = {
    fade: 200, // scrims
    sheet: 300, // sheet up and down
    push: 300, // list -> form push view
    promote: 420, // main card promotion
    fadeup: 280, // screen entry, strip reveal
    toast: 220,
    popover: 160,
} as const;

export const easing = {
    /** `cubic-bezier(.32,.72,0,1)` — sheets and push views. */
    sheet: Easing.bezier(0.32, 0.72, 0, 1),
    /** `cubic-bezier(.22,.9,.3,1)` — promotion. */
    promote: Easing.bezier(0.22, 0.9, 0.3, 1),
    /** `--spring`, `cubic-bezier(.34,1.4,.5,1)` — overshoots; docking pill. */
    spring: Easing.bezier(0.34, 1.4, 0.5, 1),
    standard: Easing.out(Easing.quad),
    linear: Easing.linear,
} as const;

/** Opacity floor of the `pulse` keyframe (2s, 1 -> .35, infinite). */
export const PULSE = { min: 0.35, duration: 1000 } as const;
