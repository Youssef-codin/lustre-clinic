// Mawid design tokens — the single source of truth for the app's visual system.
// Every value here is traced to a design in src/theme/README.md. Screens consume
// these through `className`; nothing sets a raw hex, size or family directly.
//
// Resolution of the two design token systems is Component Inventory §7.1:
// B's surfaces, radii and shadows; A's accent, fonts and touch-target floor;
// semantic colours split out of `accent` so one token never does two jobs.
/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./App.tsx', './src/**/*.{ts,tsx}'],
    presets: [require('nativewind/preset')],
    theme: {
        extend: {
            colors: {
                // Surfaces — System B (§7.1: clinical white).
                canvas: '#f4f4f6', // page behind cards, inset panels, total rows
                surface: {
                    DEFAULT: '#ffffff', // cards, sheets, fields
                    2: '#f0f0f3', // pressed states, segmented track, variant chips
                },
                hair: '#f1f1f4', // dividers inside a card
                line: '#ececef', // card + control borders

                // Text — System B.
                ink: {
                    DEFAULT: '#111114', // primary text, primary fill, black cards
                    2: '#3a3a40', // secondary text
                },
                muted: '#8b8b92', // labels, eyebrows, placeholders

                // Interactive accent — System A. Buttons, links, FAB, progress fill.
                // Never used to mean "good", "paid" or "settled".
                accent: {
                    DEFAULT: '#2f5bff',
                    soft: '#eaeeff', // derived tint, matches the -soft ramp of the others
                    text: '#1d3bc7', // derived, for accent text on a soft ground
                },

                // Semantic — status only, never interactive.
                success: {
                    DEFAULT: '#12a150', // settled, paid in full
                    soft: '#e8f6ee',
                    text: '#0d7a3d',
                    bright: '#16c964', // money hero emphasis
                },
                danger: {
                    DEFAULT: '#ef5f28', // outstanding, overdue, destructive
                    soft: '#fdeee7',
                    text: '#b3411a',
                },
                live: '#7dff9b', // in-the-chair pulse, active-timer fill
                wa: '#1f9d54', // WhatsApp actions only
            },

            // 2px grain up to 16, then 4px. Matches the gaps the designs actually
            // use (4/6/8/10/12/14) plus named tokens for the recurring structural
            // measurements that are not free choices.
            spacing: {
                gutter: '20px', // screen side padding
                bleed: '16px', // inset for cards that run wider than the text column
                row: '44px', // minimum interactive row height (§7.1)
                control: '48px', // text fields, selects
                button: '52px', // primary button height (§7.1)
                nav: '84px', // bottom tab bar height
                dock: '12px', // gap between a docked element and the nav
            },

            minHeight: {
                row: '44px',
                control: '48px',
                button: '52px',
            },

            // System B's radius scale.
            borderRadius: {
                sm: '10px', // small controls, icon tiles
                md: '12px', // inputs, chips
                lg: '14px', // buttons, fields, toasts
                xl: '16px', // cards
                '2xl': '18px', // group cards, due card
                sheet: '26px', // bottom sheets (top corners)
                full: '999px', // pills, primary buttons, dots
            },

            borderWidth: {
                hair: '1px',
                thick: '1.5px', // secondary outline buttons
            },

            // One family per weight. React Native does not synthesise weights from
            // a single family, and Instrument Sans' 500/600 will silently fall back
            // to 400 if selected with `font-medium` instead of the family token.
            fontFamily: {
                sans: ['InstrumentSans_400Regular'],
                'sans-medium': ['InstrumentSans_500Medium'],
                'sans-semibold': ['InstrumentSans_600SemiBold'],
                'sans-bold': ['InstrumentSans_700Bold'],
                mono: ['DMMono_400Regular'],
                'mono-medium': ['DMMono_500Medium'],
                ar: ['NotoNaskhArabic_400Regular'],
                'ar-medium': ['NotoNaskhArabic_500Medium'],
                'ar-semibold': ['NotoNaskhArabic_600SemiBold'],
                'ar-bold': ['NotoNaskhArabic_700Bold'],
            },

            // The type ramp. Consumed by <Text variant>; screens do not set these.
            fontSize: {
                display: ['34px', { lineHeight: '38px', letterSpacing: '-0.8px' }],
                title: ['28px', { lineHeight: '32px', letterSpacing: '-0.6px' }],
                title2: ['23px', { lineHeight: '28px', letterSpacing: '-0.4px' }],
                title3: ['21px', { lineHeight: '26px', letterSpacing: '-0.3px' }],
                headline: ['17px', { lineHeight: '22px', letterSpacing: '-0.2px' }],
                body: ['15px', { lineHeight: '21px' }],
                callout: ['14px', { lineHeight: '20px' }],
                subhead: ['13px', { lineHeight: '18px' }],
                footnote: ['12px', { lineHeight: '16px' }],
                caption: ['11px', { lineHeight: '15px' }],
                // Mono. Numerals, amounts and eyebrow labels.
                figure: ['30px', { lineHeight: '34px' }], // large numeric field
                amount: ['20px', { lineHeight: '24px' }], // tappable prices, row amounts
                eyebrow: ['10.5px', { lineHeight: '14px', letterSpacing: '1.7px' }],
                tag: ['9.5px', { lineHeight: '13px', letterSpacing: '0.9px' }],
            },

            boxShadow: {
                pill: '0 1px 2px rgba(17,17,20,0.06), 0 3px 8px rgba(17,17,20,0.05)',
                card: '0 4px 16px rgba(17,17,20,0.06)',
                dark: '0 6px 16px rgba(17,17,20,0.22)',
                fab: '0 8px 20px rgba(47,91,255,0.35)',
            },
        },
    },
    plugins: [],
};
