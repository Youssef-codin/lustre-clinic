# Theme

The design tokens for Mawid. Every value lives in
[`packages/app/tailwind.config.js`](../../tailwind.config.js) and is consumed
through `className`. This file records where each token came from.

## Where the values came from

Two complete token systems were in play across the 14 Open Design files:
**System A** (warm `#f5f4f1` surface, Instrument Sans — day views, patients,
settings) and **System B** (clinical white, system font stack — visit, payment,
money). Neither is a superset of the other, and `--accent` meant a different
colour in each.

Component Inventory §7.1 resolves this **per axis, not wholesale** — B is later
drift, not a competing system, and the conflict dissolves once `accent` stops
doing two jobs. That resolution is what this config implements. Where a design
disagrees with §7.1, §7.1 wins.

| Axis | Taken from | Note |
| --- | --- | --- |
| Surfaces | B | white / `#f4f4f6` canvas |
| Text colours | B | `#111114` / `#3a3a40` / `#8b8b92` |
| Interactive accent | A | `#2f5bff` |
| Semantic colours | split out | see below |
| Radii, shadows | B | |
| Type | A | bundled, not a system stack |
| Touch targets | A | 44px rows, 52px buttons |
| Spacing | derived | from measured usage across all 14 designs |

## Colours

The one distinction that must not be collapsed: **`accent` is interactive,
`success`/`danger` are status.** System B used its green `#12a150` as `--accent`,
but it was never an accent — it meant *settled*. A green button and a green
balance are different things and a single token cannot carry both.

| Token | Value | Means | Source |
| --- | --- | --- | --- |
| `accent` | `#2f5bff` | buttons, links, FAB, progress fill | A `--accent` |
| `accent-soft` | `#eaeeff` | tinted ground for accent content | **derived** |
| `accent-text` | `#1d3bc7` | accent text on `accent-soft` | **derived** |
| `success` | `#12a150` | settled, paid in full | B `--accent` |
| `success-soft` | `#e8f6ee` | | B `--accent-soft` |
| `success-text` | `#0d7a3d` | | B+ `--accent-text` |
| `success-bright` | `#16c964` | money hero emphasis | B+ `--accent-bright` |
| `danger` | `#ef5f28` | outstanding, overdue, destructive | A `--hot` = B `--due` |
| `danger-soft` | `#fdeee7` | | B `--due-soft` |
| `danger-text` | `#b3411a` | | B+ `--due-text` |
| `live` | `#7dff9b` | in-the-chair pulse, active-timer fill | A `--live` |
| `wa` | `#1f9d54` | WhatsApp actions only | A `--wa` |
| `canvas` | `#f4f4f6` | page ground, inset panels, total rows | B `--canvas` |
| `surface` | `#ffffff` | cards, sheets, fields | B `--surface` |
| `surface-2` | `#f0f0f3` | pressed states, segmented track | B `--surface-2` |
| `line` | `#ececef` | card and control borders | B `--border` |
| `hair` | `#f1f1f4` | dividers inside a card | B `--hair` |
| `ink` | `#111114` | primary text, primary fill, black cards | B `--fg` |
| `ink-2` | `#3a3a40` | secondary text | B `--fg-2` |
| `muted` | `#8b8b92` | labels, eyebrows, placeholders | B `--muted` |

Three tokens are **derived** rather than lifted, because A's blue never had a
soft ramp — B's green and orange each had `-soft` and `-text` companions and the
blue needs matching ones to be usable in the same layouts.

`--older` and `--discount` from the money dashboard are deliberately absent.
`--discount` is fully specified in CSS and used by no markup; `--older` is
`success` at a second value with no rule saying when it applies. Both are
questions for the money screen, not tokens.

The **five palette variants** in the export (Clinic blue / Mint clinical / Warm
sand / Violet ink / Nile teal, plus a free-form accent override) are an Open
Design control, not a feature — §7.3. One palette only.

## Spacing

The designs use a 2px grain up to 16 and a 4px grain above it. Tailwind's default
scale is exactly that (`0.5` = 2px, `1` = 4px … `4` = 16px, `5` = 20px), so it is
kept as-is; measured gaps of 5, 7, 9, 11 and 13px are noise from hand-tuning and
snap to the grid.

Added on top are the structural measurements that are not free choices:

| Token | Value | Source |
| --- | --- | --- |
| `gutter` | 20px | B screen gutter (A used 22; B is the surface system) |
| `bleed` | 16px | inset for cards running wider than the text column |
| `row` | 44px | minimum interactive row — §7.1 |
| `control` | 48px | text fields, selects |
| `button` | 52px | primary button — §7.1 |
| `nav` | 84px | bottom tab bar — B+ `--navh` |
| `dock` | 12px | docked element to nav — B+ `--dock-gap` |

`row`, `control` and `button` are also on `minHeight`, which is how the designs
declare them (`min-height: 44px`).

## Radii and shadows

System B's scale. A's 12/14/16/20–24/26/99 and B's 10–12/14–16/18/26/999 are
close enough that only the pill differs meaningfully; B's is used.

| Token | Value | Used for |
| --- | --- | --- |
| `rounded-sm` | 10px | small controls, icon tiles |
| `rounded-md` | 12px | inputs, chips |
| `rounded-lg` | 14px | buttons, fields, toasts |
| `rounded-xl` | 16px | cards |
| `rounded-2xl` | 18px | group cards, due card |
| `rounded-sheet` | 26px | bottom sheets (top corners) |
| `rounded-full` | 999px | pills, primary buttons, dots |

| Shadow | Source |
| --- | --- |
| `shadow-pill` | B `--shadow-pill` |
| `shadow-card` | B+ `--shadow-card` |
| `shadow-dark` | B `--shadow-dark` |
| `shadow-fab` | A `--accent-sh`, `rgba(accent, .35)` |

Shadows are multi-layer `boxShadow`, supported natively on React Native 0.76+.
Verify `shadow-fab` on a physical Android device before relying on it — Android
has historically flattened multi-layer shadows to an elevation.

Device frames, bezels, Dynamic Islands and status bars in the export are
prototype scaffolding. No frame radius is tokenised.

## Type

Instrument Sans (400/500/600/700), DM Mono (400/500) and Noto Naskh Arabic
(400/500/600/700), bundled via `@expo-google-fonts/*` and loaded with
`expo-font`. §7.2: B's system stack renders as Roboto on Android, where its
620/680 weights and negative tracking collapse silently. Instrument Serif is
dropped — several designs load it and none use it.

Ten faces, ~1.1MB. [`fonts.ts`](./fonts.ts) imports each weight by subpath rather
than from the package root, which would also pull in eight italics and DM Mono
Light — 430KB nothing uses.

### One family per weight

React Native selects a face by family name alone; it does not synthesise a weight
from a family. `font-medium` on Instrument Sans falls back to 400 with no error.
So each weight is its own family token — `font-sans`, `font-sans-medium`,
`font-sans-semibold`, `font-sans-bold`, and likewise `font-mono*` and `font-ar*`.

**Do not use `font-medium` / `font-semibold` / `font-bold`.** They are Tailwind
`fontWeight` utilities and do nothing here.

### The ramp

Measured sizes across the designs cluster at 11/12/13/14/15/17 for body copy and
21/23/28/30/34 for figures. Named:

| Variant | Size / line height | Used for |
| --- | --- | --- |
| `display` | 34 / 38 | money hero figure |
| `title` | 28 / 32 | screen h1 |
| `title2` | 23 / 28 | |
| `title3` | 21 / 26 | |
| `headline` | 17 / 22 | card titles, row primaries |
| `body` | 15 / 21 | default |
| `callout` | 14 / 20 | |
| `subhead` | 13 / 18 | row secondaries |
| `footnote` | 12 / 16 | |
| `caption` | 11 / 15 | |
| `figure` | 30 / 34 | large numeric field — mono |
| `amount` | 20 / 24 | prices, row amounts — mono |
| `eyebrow` | 10.5 / 14, +1.7 tracking | uppercase section label — mono |
| `tag` | 9.5 / 13, +0.9 tracking | uppercase tag — mono |

Letter-spacing is in px, not em — React Native has no em.

### `<Text>`

Screens use [`Text`](./Text.tsx) and pass a `variant`. They never set a size, a
line height or a family:

```tsx
<Text variant="headline">Root canal</Text>
<Text variant="amount" tone="danger">EGP 2,600</Text>
<Text variant="subhead" tone="muted" weight="medium">Outstanding 12 days</Text>
```

Each variant carries a default weight; `weight` overrides it. `tone` picks a
colour token.

It also does **per-string script detection** (§6): a string containing Arabic
gets Noto Naskh automatically, even on an English screen. A clinic holds Arabic
and Latin question labels in one list, so the face is a property of the string,
not of the screen. Pass `script` to override.

Mono variants (`figure`, `amount`, `eyebrow`, `tag`) never swap to the Arabic
face. DM Mono has no Arabic-Indic coverage and §7.11 keeps numerals Latin in both
languages so tabular alignment holds.

## RTL

The app runs Arabic and English. Use logical utilities only — `ps-`/`pe-`,
`ms-`/`me-`, `start-`/`end-`, `border-s-`/`border-e-`. Never `pl-`/`pr-`,
`ml-`/`mr-`, `left-`/`right-`.

React Native's `textAlign` has no logical values. Its default, `auto`, aligns to
the base direction of the string being rendered, which is the behaviour wanted —
leave it alone rather than reaching for `text-left`.

## Enforcement

`bun test` runs [`tokens.test.ts`](./tokens.test.ts), which fails the build on:

- **arbitrary values** — `bg-[#2f5bff]`, `p-[13px]`. If a value is not in the
  config it does not exist. Adding one is a deliberate, reviewable config edit.
- **physical-direction utilities** — `pl-`, `mr-`, `left-`, `text-right`,
  `border-l-`.

The stack lints with Biome, not ESLint, and neither Biome nor NativeWind ships a
rule for either. This test is the enforcement instead.

## Wiring

NativeWind compiles `tailwind.config.js` through
[`global.css`](../../global.css) at bundle time, hooked up in three places:
`withNativeWind` in `metro.config.js`, `jsxImportSource: 'nativewind'` in
`babel.config.js`, and the `import './global.css'` at the top of `App.tsx`. Miss
any one and every `className` is silently ignored — nothing errors.

`babel.config.js` resolves its presets with `require.resolve`, and
`babel-preset-expo`, `@babel/plugin-transform-react-jsx` and
`react-native-css-interop` are direct dependencies of this package even though
nothing imports them by name. Bun's isolated linker keeps a package's own
dependencies under `node_modules/.bun/<pkg>@<hash>/`, where neither Babel's
preset resolution nor Metro's resolver — which walks up from the importing file,
and the JSX runtime import is injected into `App.tsx` — can reach them. This is
the same layout the comment in `metro.config.js` describes.

Verified by `bunx expo export --platform android`: the bundle carries the token
values and the ten font faces. Not yet seen on a physical device.

## What is not here

Motion. The designs specify a full set of curves (`promote`, `sheetup`,
`--spring`, the reduced-motion block) but Reanimated takes them as JS values, not
Tailwind utilities, so they belong with the animation helpers rather than in the
token config. Component Inventory §3.4 has the table.
