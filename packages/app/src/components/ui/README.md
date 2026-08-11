# `ui/`

The design system. Component Inventory §4, built against the tokens in
[`../../theme`](../../theme/README.md) and against nothing else.

```tsx
import { Button, Card, Sheet, TextField } from '../components/ui';
```

## The rule

A `ui/` file may import from `react`, `react-native`, `../../theme`, and its own
siblings. That is the whole list, and
[`boundaries.test.ts`](./boundaries.test.ts) fails the build on anything else —
`@mawid/shared`, a domain type, a tRPC client, a navigator, a screen.

It is not a style preference. Screens are built in parallel by separate agents
against a frozen `ui/` (§9). The moment one of them can reach a domain type
through a primitive, two screens can disagree about what a `Button` is, and the
freeze that made the parallelism safe is gone. A primitive takes strings, numbers
and a local variant union. When it needs to know that a visit has procedures or
that a balance can be outstanding, it is a `domain/` component — `<BalanceStrip
status="outstanding">` is domain, the strip it renders is not.

The barrel is the only entry point. Screens import from `components/ui`, never
from `components/ui/Button`.

## Two things that only fail on a device

**Pending state.** Every write crosses Tailscale to a PC in the clinic. The gap
between the tap and the server answering is visible, and a button that still
looks idle during it gets tapped again — on the booking screen the second tap is
a second appointment. So `Button` has `loading`, and it is not decoration:

- the label stays mounted at `opacity: 0` with the spinner over it, so the button
  does not resize under a finger that is already moving;
- presses are refused while loading, and `accessibilityState.busy` says so;
- `pressLockMs` (500 by default) swallows a repeat press in the frames between
  the finger going down and the caller's state actually flipping. Pass `0` where
  rapid presses are legitimate.

`ActionBar` and `ConfirmSheet` forward it. A screen that writes and does not pass
`loading` is a bug, not a shortcut — every one of them has a spinner-shaped hole
where the double-booking gets in.

**The keyboard.** Half the sheets hold inputs: the tooth picker's search, the
catalogue search, the payment amount, every settings editor. `Sheet` handles it
in three separate pieces, because they fail separately:

1. *The sheet moves.* `KeyboardAvoidingView` with `padding` on iOS. Android is
   left to `softwareKeyboardLayoutMode: "resize"` (set in `app.json`), which
   resizes the window under the modal — padding there as well would double it.
   `useKeyboardHeight` documents why it is not a translation distance on Android.
2. *The content stays reachable.* The scroll area's cap is the window minus the
   keyboard, so a long form scrolls to its end instead of stopping behind the
   keys.
3. *The first tap counts.* `keyboardShouldPersistTaps="handled"`. Without it the
   tap that dismisses the keyboard is swallowed, and the Save the user believes
   they pressed never fired — which looks exactly like a slow server, on a screen
   where a slow server is plausible.

`footer` is pinned below the scroll area for this reason: put actions there, not
in the content.

## What is here

| | |
| --- | --- |
| Chrome | `TopBar` `ScreenHeader` `ActionBar` `PushView` |
| Controls | `Button` `IconButton` `AddButton` `Chip` `Switch` `Radio` `SegmentedControl` `Stepper` `ReorderControls` |
| Fields | `Field` `TextField` `Textarea` `NumericField` `SearchField` `Select` `InlineEditor` `ListEditor` `Placeholder` |
| Surfaces | `Card` `CardDivider` `SectionLabel` `Tag` `Dot` `ProgressBar` `Chevron` |
| Overlays | `Sheet` `ConfirmSheet` `Scrim` `PopoverMenu` `DropdownMenu` |
| Feedback | `Toast` `Callout` `Banner` `EmptyState` `RefreshView` |
| Hooks | `useKeyboardHeight` `useReducedMotion` `usePullToRefresh` |
| Motion | `duration` `easing` `PULSE` |

`DeviceFrame` and `StatusBar` from §4.1 are prototype scaffolding and are not
ported. `HomeIndicator` is the device's, not ours.

### Decisions worth knowing before you use one

- **`Select` is a field plus a `Sheet`,** not a native picker. The platform
  pickers differ enough that the row would match neither design, and this way the
  option labels get per-string script detection for free.
- **`SegmentedControl` is the pill track** (System A). The designs grew two of
  these; they were the same control drawn twice.
- **`Chip` is one component.** The designs grew three — procedure categories,
  answer types, the payment Full/Half/Nothing row.
- **`Toast` has an action slot.** §7.15: "Visit deleted · Undo" was rendered as
  toast *text* with nothing to tap.
- **`Banner` takes a tone.** §7.14 wants stale-data and failed-write states, not
  just the one offline strip that was drawn.
- **`ReorderControls` is arrows, not drag.** Reordering is rare, the rows are
  dense, and a long-press drag on a list whose rows also carry a tappable price
  is a way to reprice a procedure by accident.
- **`InlineEditor` keeps its draft local** until blur or Return. An abandoned
  edit never reaches the caller, so it never reaches the server.
- **`PopoverMenu` takes its anchor** rather than measuring the trigger. The
  trigger is a top-bar button at a fixed inset on every screen that has one.
- **`Button` `primary` is ink, not blue.** §3.1 scopes the blue to the FAB,
  progress fill, links and dashed add buttons; System B calls `--fg` the "primary
  fill" and the designs draw black primaries. `accent` is a separate variant for
  the few genuinely blue-filled buttons.
- **`Toast` positions against its parent.** Render it as a child of the screen
  root, never inside scrolling content — nested, it lands wherever that content
  happens to have scrolled to, which is how it ended up mid-screen over the
  buttons that raised it.
- **`usePullToRefresh` is per screen, not per app.** It returns the
  `refreshControl` element and takes the screen's own `busy` flag; every screen
  refetches its own reads and nobody else's. The tabs stay mounted behind each
  other (`AppShell`), so one gesture refreshing all of them would put three
  screens of traffic on the tunnel for a screen nobody is looking at — `/ws` is
  what keeps the others fresh. `RefreshView` is the same gesture for a state
  that does not scroll (an empty day, a failed read), which is exactly where a
  refresh is most wanted.
- **Placeholders are drawn by us, not by `TextInput`.** Android renders the
  native hint in the system typeface whatever `fontFamily` the input carries — on
  a Samsung the placeholder came out in One UI's face beside a label in
  Instrument Sans. Every input routes through `Placeholder`, so the platforms
  cannot drift, and an Arabic placeholder gets Noto Naskh, which the native hint
  could not do either. Found on a device; no check we run would have caught it.

## Motion

[`motion.ts`](./motion.ts) holds §3.4 — the theme is values-only and deliberately
carries no curves. `useReducedMotion` is the React Native equivalent of the
`prefers-reduced-motion` block every design ends with; animations run at duration
0 rather than being skipped, so the end state still lands.

Everything animates on `Animated` with `useNativeDriver`. Reanimated is not a
dependency and nothing here needs it.

## Not done

- **Safe-area insets.** `Sheet` and `ActionBar` clear the home indicator with a
  fixed `space[6]`. `react-native-safe-area-context` is a native dependency and a
  rebuild; it belongs with the app shell, and both paddings become insets when it
  lands.
- **Icons.** Components take `icon?: ReactNode` and the gallery passes text
  glyphs. There is no icon set yet and no SVG dependency; `Chevron` is drawn from
  borders because it is structural and mirrors in Arabic.
- **`domain/DockingSearchPill`.** Deferred per §9 — a plain `SearchField` ships.
- **Component tests.** `boundaries.test.ts` and the theme's `tokens.test.ts` are
  static checks over source. There is no renderer in `bun test`, so behaviour is
  verified on the gallery screen.

## Gallery

[`src/screens/dev/GalleryScreen.tsx`](../../screens/dev/GalleryScreen.tsx) renders
every primitive in its states and is what `App.tsx` currently mounts. Two sections
exist to be poked at on a device rather than read: **Pending state**, which counts
writes so a double-tap during the spinner is visible as a number, and
**Overlays**, whose sheet has five fields so the keyboard has somewhere to go
wrong.
