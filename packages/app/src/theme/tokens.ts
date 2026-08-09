// Mawid design tokens — the single source of truth for the app's visual system.
// Every value here is traced to a design in README.md. Components consume these
// through `StyleSheet.create`; nothing writes a raw hex, size or family.
//
// Resolution of the two design token systems is Component Inventory §7.1:
// B's surfaces, radii and shadows; A's accent, fonts and touch-target floor;
// semantic colours split out of `accent` so one token never does two jobs.

export const color = {
    // Surfaces — System B (§7.1: clinical white).
    canvas: '#f4f4f6', // page behind cards, inset panels, total rows
    surface: '#ffffff', // cards, sheets, fields
    surface2: '#f0f0f3', // pressed states, segmented track, variant chips
    hair: '#f1f1f4', // dividers inside a card
    line: '#ececef', // card + control borders

    // Text — System B.
    ink: '#111114', // primary text, primary fill, black cards
    ink2: '#3a3a40', // secondary text
    muted: '#8b8b92', // labels, eyebrows, placeholders
    inverse: '#ffffff', // text on ink or accent

    // Interactive accent — System A. Buttons, links, FAB, progress fill.
    // Never used to mean "good", "paid" or "settled".
    accent: '#2f5bff',
    accentSoft: '#eaeeff', // derived tint, matches the -soft ramp of the others
    accentText: '#1d3bc7', // derived, for accent text on a soft ground

    // Semantic — status only, never interactive.
    success: '#12a150', // settled, paid in full
    successSoft: '#e8f6ee',
    successText: '#0d7a3d',
    successBright: '#16c964', // money hero emphasis

    // Owed or late — money and time. Balances, overdue visits, no-show,
    // a patient waiting too long, a fully-booked day.
    due: '#ef5f28',
    dueSoft: '#fdeee7',
    dueText: '#b3411a',

    // Destructive and error. Delete, deactivate, the destructive confirm,
    // a missing required answer. Never used for money.
    danger: '#e5342a',
    dangerSoft: '#fce4e4',
    dangerText: '#b21e15',

    live: '#7dff9b', // in-the-chair pulse, active-timer fill
    wa: '#1f9d54', // WhatsApp actions only
} as const;

/**
 * 2px grain up to 16, then 4px. Matches the gaps the designs actually use
 * (4/6/8/10/12/14); measured 5, 7, 9, 11 and 13 are hand-tuning noise and snap
 * to the grid. Keyed by the familiar 4px-step numbering, so `space[3]` is 12.
 */
export const space = {
    0: 0,
    0.5: 2,
    1: 4,
    1.5: 6,
    2: 8,
    2.5: 10,
    3: 12,
    3.5: 14,
    4: 16,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
    10: 40,
    12: 48,
} as const;

/** Structural measurements that are not free choices. */
export const size = {
    gutter: 20, // screen side padding
    bleed: 16, // inset for cards running wider than the text column
    row: 44, // minimum interactive row height (§7.1)
    control: 48, // text fields, selects
    button: 52, // primary button height (§7.1)
    nav: 84, // bottom tab bar height
    dock: 12, // gap between a docked element and the nav
} as const;

/** System B's radius scale. */
export const radius = {
    sm: 10, // small controls, icon tiles
    md: 12, // inputs, chips
    lg: 14, // buttons, fields, toasts
    xl: 16, // cards
    xl2: 18, // group cards, due card
    sheet: 26, // bottom sheets (top corners)
    full: 999, // pills, primary buttons, dots
} as const;

export const border = {
    hair: 1,
    thick: 1.5, // secondary outline buttons
} as const;

/**
 * One family per weight. React Native selects a face by family name alone and
 * does not synthesise a weight, so `fontWeight: '600'` on Instrument Sans falls
 * back to 400 with no error. Always set `fontFamily`, never `fontWeight`.
 *
 * Keys match the faces registered in fonts.ts.
 */
export const font = {
    sans: {
        regular: 'InstrumentSans_400Regular',
        medium: 'InstrumentSans_500Medium',
        semibold: 'InstrumentSans_600SemiBold',
        bold: 'InstrumentSans_700Bold',
    },
    // DM Mono ships 400 and 500 only; heavier weights round down to 500.
    mono: {
        regular: 'DMMono_400Regular',
        medium: 'DMMono_500Medium',
        semibold: 'DMMono_500Medium',
        bold: 'DMMono_500Medium',
    },
    arabic: {
        regular: 'NotoNaskhArabic_400Regular',
        medium: 'NotoNaskhArabic_500Medium',
        semibold: 'NotoNaskhArabic_600SemiBold',
        bold: 'NotoNaskhArabic_700Bold',
    },
} as const;

/**
 * The type ramp. Consumed by <Text variant>; screens do not set these.
 * Letter-spacing is in px — React Native has no em.
 */
export const type = {
    display: { fontSize: 34, lineHeight: 38, letterSpacing: -0.8 }, // money hero figure
    title: { fontSize: 28, lineHeight: 32, letterSpacing: -0.6 }, // screen h1
    title2: { fontSize: 23, lineHeight: 28, letterSpacing: -0.4 },
    title3: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3 },
    headline: { fontSize: 17, lineHeight: 22, letterSpacing: -0.2 }, // card titles, row primaries
    body: { fontSize: 15, lineHeight: 21, letterSpacing: 0 }, // default
    callout: { fontSize: 14, lineHeight: 20, letterSpacing: 0 },
    subhead: { fontSize: 13, lineHeight: 18, letterSpacing: 0 }, // row secondaries
    footnote: { fontSize: 12, lineHeight: 16, letterSpacing: 0 },
    caption: { fontSize: 11, lineHeight: 15, letterSpacing: 0 },
    figure: { fontSize: 30, lineHeight: 34, letterSpacing: 0 }, // large numeric field — mono
    amount: { fontSize: 20, lineHeight: 24, letterSpacing: 0 }, // prices, row amounts — mono
    eyebrow: { fontSize: 10.5, lineHeight: 14, letterSpacing: 1.7 }, // section label — mono
    tag: { fontSize: 9.5, lineHeight: 13, letterSpacing: 0.9 }, // uppercase tag — mono
} as const;

/**
 * Multi-layer shadows, System B. React Native 0.76+ takes `boxShadow` directly.
 * Check `fab` on a physical Android device — Android has historically flattened
 * multi-layer shadows to a single elevation.
 */
export const shadow = {
    pill: '0 1px 2px rgba(17,17,20,0.06), 0 3px 8px rgba(17,17,20,0.05)',
    card: '0 4px 16px rgba(17,17,20,0.06)',
    dark: '0 6px 16px rgba(17,17,20,0.22)',
    fab: '0 8px 20px rgba(47,91,255,0.35)',
} as const;

export type Color = keyof typeof color;
export type Space = keyof typeof space;
export type Radius = keyof typeof radius;
export type TypeVariant = keyof typeof type;
