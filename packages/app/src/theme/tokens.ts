// Lustre design tokens — the single source of truth for the app's visual system,
// resolving the two design systems (Component Inventory §7.1). Components
// consume these through `StyleSheet.create`; nothing writes a raw hex, size or
// family.
//
// Invariants: `accent` never means "good", "paid" or "settled" and is not the
// primary button fill (the designs draw those in `ink`); semantic colours are
// status only, never interactive; `danger` is never used for money. `space` is
// keyed by 4px steps (`space[3]` is 12) and measured odd sizes snap to the
// grid. React Native selects a face by family name and never synthesises a
// weight, so always set `fontFamily`, never `fontWeight`; DM Mono ships 400 and
// 500 only, and heavier weights round down to 500. Letter-spacing is in px —
// React Native has no em. Android has historically flattened multi-layer
// `boxShadow` to a single elevation, so check `fab` on a physical device.

export const color = {
    canvas: '#f4f4f6',
    surface: '#ffffff',
    surface2: '#f0f0f3',
    hair: '#f1f1f4',
    line: '#ececef',
    outline: 'rgba(17,17,20,0.14)',

    ink: '#111114',
    ink2: '#3a3a40',
    muted: '#8b8b92',
    inverse: '#ffffff',

    accent: '#2f5bff',
    accentSoft: '#eaeeff',
    accentText: '#1d3bc7',

    success: '#12a150',
    successSoft: '#e8f6ee',
    successText: '#0d7a3d',
    successBright: '#16c964',

    due: '#ef5f28',
    dueSoft: '#fdeee7',
    dueText: '#b3411a',

    danger: '#e5342a',
    dangerSoft: '#fce4e4',
    dangerText: '#b21e15',

    live: '#7dff9b',
    wa: '#1f9d54',

    scrim: 'rgba(17,17,20,0.34)',
} as const;

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

export const size = {
    gutter: 20,
    bleed: 16,
    row: 44,
    control: 48,
    button: 52,
    nav: 84,
    dock: 12,
} as const;

export const radius = {
    sm: 10,
    md: 12,
    lg: 14,
    xl: 16,
    xl2: 18,
    xl3: 24,
    sheet: 26,
    full: 999,
} as const;

export const border = {
    hair: 1,
    thick: 1.5,
} as const;

export const font = {
    sans: {
        regular: 'InstrumentSans_400Regular',
        medium: 'InstrumentSans_500Medium',
        semibold: 'InstrumentSans_600SemiBold',
        bold: 'InstrumentSans_700Bold',
    },
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

export const type = {
    display: { fontSize: 34, lineHeight: 38, letterSpacing: -0.8 },
    title: { fontSize: 28, lineHeight: 32, letterSpacing: -0.6 },
    title2: { fontSize: 23, lineHeight: 28, letterSpacing: -0.4 },
    title3: { fontSize: 21, lineHeight: 26, letterSpacing: -0.3 },
    headline: { fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
    body: { fontSize: 15, lineHeight: 21, letterSpacing: 0 },
    callout: { fontSize: 14, lineHeight: 20, letterSpacing: 0 },
    subhead: { fontSize: 13, lineHeight: 18, letterSpacing: 0 },
    footnote: { fontSize: 12, lineHeight: 16, letterSpacing: 0 },
    caption: { fontSize: 11, lineHeight: 15, letterSpacing: 0 },
    figure: { fontSize: 30, lineHeight: 34, letterSpacing: 0 },
    amount: { fontSize: 20, lineHeight: 24, letterSpacing: 0 },
    eyebrow: { fontSize: 10.5, lineHeight: 14, letterSpacing: 1.7 },
    tag: { fontSize: 9.5, lineHeight: 13, letterSpacing: 0.9 },
} as const;

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
