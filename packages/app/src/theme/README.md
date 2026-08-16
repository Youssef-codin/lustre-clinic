# Theme

The design tokens for Lustre. Every value lives in [`tokens.ts`](./tokens.ts) and
is consumed through `StyleSheet.create`. This file records where each token came
from.

```tsx
import { color, radius, size, space, Text } from '../theme';

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: size.row,
        padding: space[4],
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.surface,
    },
});
```

There is no NativeWind and no Tailwind. That was the original plan and it worked,
but it earns its keep by making components terser to *write by hand*, and these
are written with an agent — so it was paying a build-layer cost for a benefit
nobody collects. A plain typed module gives better guarantees for the same
tokens: `color.dou` is a compile error, where a mistyped `className` renders
unstyled and silent. Nothing here needs a babel plugin, a metro transform or a
`tailwind.config.js` kept in sync with an upgrade.

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

Two distinctions that must not be collapsed.

**`accent` is interactive, everything else is status.** System B used its green
`#12a150` as `--accent`, but it was never an accent — it meant *settled*. A green
button and a green balance are different things and a single token cannot carry
both.

**Interactive is not the same as primary.** §7.1 summarises the blue as
"buttons, links, FAB, progress fill", but §3.1 — the inventory it is summarising
— scopes it to "FAB, progress fill, links, dashed add buttons", and System B
records `--fg #111114` as "text, *primary fill*". The designs draw solid black
primary buttons. So `ink` is the primary fill and `accent` is the blue that sits
*on* a surface; `ui/Button` has both, and `primary` is the black one.

**`due` is money, `danger` is destruction.** §7.1 merged A's `--hot` and B's
`--due` on the grounds that they were the same orange under two names. They were
not: in the designs `--due` carries balance strips, the owing ring and patient
amounts, while `--hot` carries the delete button, the destructive confirm and the
`.del` press state — and, because A had nothing else warm, *also* every amount
owed. That overload is the same mistake as `accent`, one level down. Split:

| | |
| --- | --- |
| `due` | owed or late — money **and** time. Balances, overdue visits, no-show, a patient waiting too long, a fully-booked day. |
| `danger` | destructive and error. Delete, deactivate, the destructive confirm, a missing required answer. |

`due` keeps `#ef5f28` because it owns the ramp the money screens already use
(`--due-soft`, `--due-text`). `danger` is new. The test is whether a delete
button and an outstanding balance can be told apart at a glance; they are next to
each other in the `App.tsx` smoke test for exactly that reason.

| Token | Value | Means | Source |
| --- | --- | --- | --- |
| `accent` | `#2f5bff` | FAB, progress fill, links, dashed add buttons | A `--accent` |
| `accent-soft` | `#eaeeff` | tinted ground for accent content | **derived** |
| `accent-text` | `#1d3bc7` | accent text on `accent-soft` | **derived** |
| `success` | `#12a150` | settled, paid in full | B `--accent` |
| `success-soft` | `#e8f6ee` | | B `--accent-soft` |
| `success-text` | `#0d7a3d` | | B+ `--accent-text` |
| `success-bright` | `#16c964` | money hero emphasis | B+ `--accent-bright` |
| `due` | `#ef5f28` | outstanding, overdue, no-show | B `--due` |
| `due-soft` | `#fdeee7` | | B `--due-soft` |
| `due-text` | `#b3411a` | | B+ `--due-text` |
| `danger` | `#e5342a` | delete, deactivate, error | **new** |
| `danger-soft` | `#fdecea` | | **new** |
| `danger-text` | `#b21e15` | | **new** |
| `live` | `#7dff9b` | in-the-chair pulse, active-timer fill | A `--live` |
| `wa` | `#1f9d54` | WhatsApp actions only | A `--wa` |
| `scrim` | `rgba(17,17,20,.34)` | ground behind a sheet or popover | B |
| `canvas` | `#f4f4f6` | page ground, inset panels, total rows | B `--canvas` |
| `surface` | `#ffffff` | cards, sheets, fields | B `--surface` |
| `surface-2` | `#f0f0f3` | pressed states, segmented track | B `--surface-2` |
| `line` | `#ececef` | card and control borders | B `--border` |
| `hair` | `#f1f1f4` | dividers inside a card | B `--hair` |
| `ink` | `#111114` | primary text, primary fill, black cards | B `--fg` |
| `ink-2` | `#3a3a40` | secondary text | B `--fg-2` |
| `muted` | `#8b8b92` | labels, eyebrows, placeholders | B `--muted` |

Three accent tokens are **derived** rather than lifted, because A's blue never had
a soft ramp — B's green and orange each had `-soft` and `-text` companions and the
blue needs matching ones to be usable in the same layouts. The `danger` ramp is
**new**, built to sit at the same lightness as `due` so the two read as siblings
rather than as one colour someone got wrong.

`--older` and `--discount` from the money dashboard are deliberately absent.
`--discount` is fully specified in CSS and used by no markup; `--older` is
`success` at a second value with no rule saying when it applies. Both are
questions for the money screen, not tokens.

The **five palette variants** in the export (Clinic blue / Mint clinical / Warm
sand / Violet ink / Nile teal, plus a free-form accent override) are an Open
Design control, not a feature — §7.3. One palette only.

## Spacing

The designs use a 2px grain up to 16 and a 4px grain above it. `space` is keyed
by the familiar 4px-step numbering, so `space[3]` is 12 and `space[1.5]` is 6;
measured gaps of 5, 7, 9, 11 and 13px are noise from hand-tuning and snap to the
grid.

`size` holds the structural measurements that are not free choices:

| Token | Value | Source |
| --- | --- | --- |
| `gutter` | 20 | B screen gutter (A used 22; B is the surface system) |
| `bleed` | 16 | inset for cards running wider than the text column |
| `row` | 44 | minimum interactive row — §7.1 |
| `control` | 48 | text fields, selects |
| `button` | 52 | primary button — §7.1 |
| `nav` | 84 | bottom tab bar — B+ `--navh` |
| `dock` | 12 | docked element to nav — B+ `--dock-gap` |

`row`, `control` and `button` belong on `minHeight`, which is how the designs
declare them (`min-height: 44px`) — a row that must grow for two lines of Arabic
still has to clear 44.

## Radii and shadows

System B's scale. A's 12/14/16/20–24/26/99 and B's 10–12/14–16/18/26/999 are
close enough that only the pill differs meaningfully; B's is used.

| Token | Value | Used for |
| --- | --- | --- |
| `radius.sm` | 10 | small controls, icon tiles |
| `radius.md` | 12 | inputs, chips |
| `radius.lg` | 14 | buttons, fields, toasts |
| `radius.xl` | 16 | cards |
| `radius.xl2` | 18 | group cards, due card |
| `radius.xl3` | 24 | the chair card, `day-view-schedule.html` |
| `radius.sheet` | 26 | bottom sheets (top corners) |
| `radius.full` | 999 | pills, primary buttons, dots |

| Shadow | Source |
| --- | --- |
| `shadow.pill` | B `--shadow-pill` |
| `shadow.card` | B+ `--shadow-card` |
| `shadow.dark` | B `--shadow-dark` |
| `shadow.fab` | A `--accent-sh`, `rgba(accent, .35)` |

Shadows are multi-layer `boxShadow` strings, which React Native takes directly on
0.76+. Verify `shadow.fab` on a physical Android device before relying on it —
Android has historically flattened multi-layer shadows to an elevation.

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
from a family. `fontWeight: '600'` on Instrument Sans falls back to 400 with no
error. So each weight is its own family name, grouped in `font`:

```ts
font.sans.semibold; // 'InstrumentSans_600SemiBold'
font.mono.medium; //   'DMMono_500Medium'
font.arabic.bold; //   'NotoNaskhArabic_700Bold'
```

**Never set `fontWeight`.** Set `fontFamily` from `font`, or let `<Text>` do it.

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
<Text variant="amount" tone="due">EGP 2,600</Text>
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

The app runs Arabic and English, and React Native mirrors layout by direction
only for logical properties. Use `paddingStart`/`paddingEnd`,
`marginStart`/`marginEnd`, `start`/`end` and `borderStartWidth`. Never
`paddingLeft`, `marginRight`, `left`, `right` or `borderLeftWidth`.

`textAlign` has no logical values in React Native. Its default, `auto`, aligns to
the base direction of the string being rendered, which is the behaviour wanted —
leave it alone rather than reaching for `'left'`.

Layout does not actually mirror until the app shell calls `I18nManager.allowRTL`.
That belongs with the localisation scaffold, not here.

## Enforcement

Most of it is TypeScript's: `color.dou`, `radius.huge` and
`<Text variant="huge">` are compile errors, which is the main reason this is a
typed module rather than a class-name string.

Two things types cannot catch, so [`tokens.test.ts`](./tokens.test.ts) does,
under `bun test`:

- **raw colour values** — any `#hex` or `rgba(` outside `tokens.ts`. If a colour
  is not a token it does not exist.
- **physical-direction style properties** — `paddingLeft`, `marginRight`,
  `left:`, `textAlign: 'left'`.

There is deliberately no "no magic number" rule. A stray `padding: 13` is a
review comment, not a build failure, and a check that fired on every numeric
literal would be turned off within a week.

## Verified

`bunx expo export --platform android` bundles clean and carries the ten font
faces. Not yet seen on a physical device.

## What is not here

Motion. The designs specify a full set of curves (`promote`, `sheetup`,
`--spring`, the reduced-motion block). They belong with the animation helpers
alongside Reanimated rather than in this file, which is values only. Component
Inventory §3.4 has the table.
