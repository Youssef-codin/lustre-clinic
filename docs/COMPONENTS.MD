# Mawid — Component Inventory

Derived from the Open Design project at
`~/.local/share/open-design/projects/d5a02373-724b-4b20-b07a-46c9dfa7455b`
(14 HTML designs, latest touched 9 Aug 2026).

This is an inventory of what the designs *contain*, not a build plan. Nothing here
is implemented yet — `packages/app` is still the bare Expo starter. Where two
designs disagree, both are recorded and the conflict is listed in §7.

---

## 1. Source designs

| Design file | Screen | Token system | Notes |
|---|---|---|---|
| `doctor-day-view.html` | Day view | A | Newest day view. RTL-aware, offline banner, 4-state main card |
| `day-view-schedule.html` | Day view (earlier) | A | Has the FAB, calendar sheet and Reminders tab that the newer one dropped |
| `patients-list.html` | Patients | A | Search, recent list, A–Z grouping described but not drawn |
| `patient-view.html` | Patient record | A | Visits / Details tabs, outstanding strip |
| `patient-edit.html` | Patient edit | A | Basics card + dynamic clinic questions |
| `check-in.html` | Visit in progress | B | Empty + populated states, procedure groups, tooth/catalogue sheets |
| `visit-payment.html` | Payment | B | Amount paid, method tiles, done sheet. **Opens with a redirect stub** (§7.5) |
| `appointment-view.html` | Visit (read-only) | B | Same redirect stub |
| `appointment-edit-v3.html` | Visit edit | B | Treatment / Payment tabs, overflow menu, overpaid state |
| `money-dashboard-v2.html` | Finances | B+ | Largest design. Hero, stat cards, takings, debtors, docking search |
| `settings.html` | Settings (7 sub-screens) | A | Index, App, Appointments, Reminders, Clinic, Branches, Branch edit, role sheet |
| `settings-procedures.html` | Settings → Procedures & prices | A | List + form + category sheet + confirm sheet, fully bilingual |
| `settings-patient-fields.html` | Settings → Patient fields | A | Fixed vs custom questions, 5 answer types, live preview, delete sheet |
| `black-card-explorations.html` | — | A | Three unpicked directions for the "next up" card. Exploration only |

`support.js` is the Open Design runtime (`x-dc` templates, `sc-for`, `sc-if`) —
prototype scaffolding, not part of the product.

**Screens in `SPEC.MD` §18 Phase 2 with no design yet:** book / move / cancel an
appointment, walk-in creation, book-next inline at checkout, missed appointments,
the repeating notification + dismiss-for-today, and first-launch onboarding
(Tailscale → reachability → role selection, §6).

---

## 2. Proposed structure

```
packages/app/src/components/
  ui/        design system — knows nothing about Mawid
  domain/    knows what a visit, procedure, patient or balance is
```

**The rule.** A `ui/` component takes primitives (`string`, `number`, a local
variant union) and never imports from `@mawid/shared` or from an inferred
`AppRouter` type. The moment a component needs to know that a visit has
procedures, or that a balance can be outstanding, it belongs in `domain/`.

`ui/` is where the two token systems get reconciled once (§7.1) so that no screen
ever writes a raw hex value. `domain/` composes `ui/` and adds product meaning —
`<BalanceStrip status="outstanding">` is domain, the `<Strip>` it renders is not.

Screen-level compositions live under `src/screens/`, not here.

---

## 3. Design tokens

Two complete and incompatible token sets are in play. Neither is a superset of the
other, and `--accent` means a different colour in each.

### 3.1 System A — "Instrument" (warm surface)

Used by: day views, patients, patient record/edit, all settings screens.

```
--surf    #f5f4f1   page surface
--ink     #0e1116   text, primary fill, black cards
--accent  #2f5bff   blue — FAB, progress fill, links, dashed add buttons
--live    #7dff9b   in-the-chair pulse, active-timer fill
--wa      #1f9d54   WhatsApp actions, reassurance callouts
--hot     #ff5a1f   outstanding money, overdue, destructive
--accent-sh  rgba(accent, .35)   derived, used for the FAB shadow
```

Non-tokenised but consistent: hairlines `rgba(0,0,0,.06–.09)`, card border
`rgba(0,0,0,.1)`, muted text `rgba(0,0,0,.42–.5)`, cards `#fff`.

Type: `Instrument Sans` (400–700), `DM Mono` (400/500) for all numerals and
eyebrow labels, `Noto Naskh Arabic` (400–600). `settings-patient-fields` promotes
the Arabic face to a token (`--ar`) and applies it **per string** rather than per
screen — see §6. `Instrument Serif` is loaded on several screens but never used.

Radii: 12 (inputs) · 14 (buttons) · 16 (cards) · 20–24 (black cards) · 26 (sheets) · 99 (pills).
Frame: 390 × 844, radius 36.

**Palette variants.** Five named palettes ship as an Open Design prop — Clinic
blue (default), Mint clinical, Warm sand, Violet ink, Nile teal — each redefining
`surf / ink / accent / live / wa / hot`, plus a free-form accent override. See §7.3.

### 3.2 System B — "SF Pro" (clinical white)

Used by: visit in progress, payment, visit view/edit, money.

```
--bg          #ffffff
--canvas      #f4f4f6   inset panels, total rows, due card
--surface     #ffffff   cards
--surface-2   #f0f0f3   pressed states, segmented track, variant chips
--fg          #111114   text, primary fill
--fg-2        #3a3a40   secondary text
--muted       #8b8b92   labels, eyebrows, placeholder
--border      #ececef   card + control borders
--hair        #f1f1f4   in-card dividers
--accent      #12a150   green — settled, paid in full
--accent-soft #e8f6ee
--due         #ef5f28   orange — outstanding, destructive
--due-soft    #fdeee7
--shadow-pill 0 1px 2px rgba(17,17,20,.06), 0 3px 8px rgba(17,17,20,.05)
--shadow-dark 0 6px 16px rgba(17,17,20,.22)
--font        -apple-system, "SF Pro Text", ui-sans-serif, "Segoe UI", Roboto, system-ui
```

Radii: 10–12 (small controls) · 14–16 (fields, cards) · 18 (group cards, due card)
· 26 (sheets) · 999 (pills, primary buttons).
Frame: 393 × 852, 11px bezel, 118 × 34 Dynamic Island, screen radius 44.

### 3.3 System B+ — money dashboard extensions

`money-dashboard-v2.html` adds, on top of B:

```
--accent-text   #0d7a3d      --older        #0e8a5c
--accent-bright #16c964      --older-soft   #e8f6ee
--due-text      #b3411a      --older-text   #0a6b47
--discount      #16c964      --discount-soft #edfcf2   --discount-text #0d7a3d
--spring        cubic-bezier(.34, 1.4, .5, 1)
--navh          84px         bottom-nav height, read by both CSS and JS
--dock-gap      12px         gap between the docked search pill and the nav
--shadow-card   0 4px 16px rgba(17,17,20,.06)
```

`--discount` is fully specified in CSS (hero-stat and stat-card variants) but no
markup uses it — a designed-but-unshipped state.

### 3.4 Motion

| Name | Curve / duration | Where |
|---|---|---|
| `pulse` | 2s infinite, opacity 1 → .35 | live dot, WhatsApp dot, in-progress chip |
| `promote` | .42s `cubic-bezier(.22,.9,.3,1)` | main card when a new patient is promoted |
| `fadeup` | .26–.3s | screen entry, checked-in strip |
| `sheetup` / `.sheet` | .24–.32s `cubic-bezier(.32,.72,0,1)` | every bottom sheet |
| push view | .3s `cubic-bezier(.32,.72,0,1)`, `translateX(±100%)` | list → form in both settings editors, RTL-flipped |
| `fade` | .18–.22s | scrims |
| `spin` | 1s–1.2s linear | connection retry icon, countdown ring |
| `stripout` | max-height + opacity | strip dismissal (declared, unused) |
| `--spring` | `cubic-bezier(.34,1.4,.5,1)` | money search pill dock/undock |

Every plain-HTML design ends with
`@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important } }`.

### 3.5 Spacing and touch targets

Screen gutter is 20px (B) or 22px (A); cards inset to 16px when they should bleed
wider than the text column. B designs consistently declare `min-height: 44px` on
interactive rows and 52px on primary buttons; A declares 38 / 44 / 46 / 48
depending on the screen — no single scale.

---

## 4. `ui/` — primitives

### 4.1 Layout and chrome

| Component | Variants / states | Source |
|---|---|---|
| `ui/DeviceFrame` | A: 390×844, r36 · B: 393×852, bezel + Dynamic Island | all — **prototype only, do not port** |
| `ui/StatusBar` | A: mono time + `▮▮ ▮` · B: time + signal/wifi/battery | all — **prototype only** |
| `ui/HomeIndicator` | 138×5 pill, ink@15% (A) / #0c0c0e@22% (B) | most |
| `ui/TopBar` | back-only · back + title · back + title + trailing icon · back + title + text button (`Reorder`/`Done`, hidden below 2 rows) | every sub-screen |
| `ui/ScreenHeader` | large `h1` + optional overflow icon button | money, settings index |
| `ui/ActionBar` | single primary (A: solid + hairline; B: gradient fade + pill + shadow-dark) · **two-button** Cancel / Save at flex 1 : 1.6 · stateful label | edit, payment, both settings editors |
| `ui/PushView` | absolutely-positioned sibling view sliding in from the inline edge; RTL-flipped | settings procedures, settings patient fields |

### 4.2 Controls

| Component | Variants / states |
|---|---|
| `ui/Button` | primary solid (r14 A / pill B, 46–52px) · secondary outline 1.5px · ghost pill (bordered, shadow-pill) · text button with `.on` fill · danger (hot outline, `.revive` neutral variant) · disabled (opacity .32, or grey fill + muted label) |
| `ui/IconButton` | 34px circle (universal) · 40px filled circle (WhatsApp/call) · 32px rounded square (calendar nav) · 26–38px bare destructive (`kill`, `del`, option ✕) |
| `ui/AddButton` | full-width dashed accent (`add-opt`) · inset dashed row (`addrow`) · in-card footer (`gadd`) · compact filled ink (options editor "Add") |
| `ui/Card` | white, 1px border, r16 (A) / r18 `--border` (B), `overflow:hidden` so rows hairline-divide · **dashed variant** for read-only/built-in content |
| `ui/SectionLabel` | mono 10.5px uppercase .16em muted (A) / 11px 700 (B); optional trailing count, optional trailing action |
| `ui/Tag` | outline · filled-outline (required, checkup) · muted (inactive) — 9.5–10.5px mono, uppercase, tracked |
| `ui/Chip` | selectable, r12, 44px min, ink fill when on; `.new` dashed accent variant. **Currently three implementations** — procedures categories, field answer types, payment Full/Half/Nothing |
| `ui/Dot` | 5–8px; live (pulsing), wa, hot, accent, muted |
| `ui/ProgressBar` | 3px inline · 5px on dark · hero split bar · bar with a travelling % label · SVG arc + spinner ring (explorations) |
| `ui/TextField` | white r14 48px, focus → ink border · `.ar` sibling (Naskh, RTL, right-aligned) · borderless inline variant (option rows) |
| `ui/NumericField` | large display (30px mono, currency prefix, 62px tall) · end-aligned with unit suffix · borderless inline with focus underline (`costin`) |
| `ui/InlineEditor` | tap a value → becomes an input in place; commit on blur/Enter, Escape reverts |
| `ui/Textarea` | 76px min, r14, focus border |
| `ui/Select` | native select + data-URI chevron |
| `ui/Switch` | 46×28, 22px knob, ink when on, RTL-aware translate |
| `ui/Radio` | 22px ring + 10px fill |
| `ui/SegmentedControl` | A pill track (`rgba(0,0,0,.06)`, r99, 3px pad) · B grid with `aria-selected` + shadow-pill. **Two implementations** |
| `ui/Stepper` | −/value/+ on a grey track, 34px buttons, mono value, 62px min width |
| `ui/SearchField` | inline (white, r14) · sheet (canvas, 42px) · docking pill (see `domain/DockingSearchPill`) |
| `ui/ListEditor` | numbered rows with an inline input + remove ✕, plus a draft-input footer with an Add button, plus an empty line ("add at least two"). Used for dropdown options |
| `ui/ReorderControls` | stacked ↑/↓ 32px buttons, disabled at the ends, revealed by a Reorder/Done toggle that also swaps other row affordances out |

### 4.3 Feedback and overlays

| Component | Variants / states |
|---|---|
| `ui/Toast` | ink pill, r14, slide-up 16px, ~2.0–2.6s. Three different bottom offsets across screens (34 / 88 / 96px) |
| `ui/Scrim` | `rgba(17,17,20,.34)` (B) / `rgba(14,17,22,.42)` (A) |
| `ui/Sheet` | r26 top, `translateY(102%)` → 0, grab handle 38×4–5 |
| `ui/ConfirmSheet` | title + body + optional callout + Cancel / Confirm (flex 1 : 1.4); `hot` confirm for destructive |
| `ui/Callout` | info (grey + info icon) · warning (hot tint + hot border + triangle) · reassurance (wa tint + check) · inline note (dashed card footer with a lock glyph) |
| `ui/Banner` | full-width screen-level variant of the same, used for offline |
| `ui/PopoverMenu` | anchored top-right, scale .94 → 1, icon rows, hairline divider, danger item |
| `ui/DropdownMenu` | `role="menu"` with `menuitemradio` + check glyph |
| `ui/EmptyState` | **two weights** — 52px circular ring + plus + h3 + body + pill CTA (check-in) · dashed panel + 52px rounded-square glyph + h3 + body + full-width primary (patient fields). Money adds two lighter one-liners |

---

## 5. `domain/` — Mawid-specific

| Component | Variants / states | Screen |
|---|---|---|
| `domain/BottomTabBar` | Always four items — Day · Patients · Money · **role tab**. Two variants differing only in the fourth item's icon and label: **Doctor** or **Secretary**, set by the active role. Rendering splits by token system: A inline vs B fixed (`--navh` 84px), with two different icon sets for the three shared tabs | day views, patients, money, settings |
| `domain/BrandWordmark` | "MAWID", 600/15px, tracking .28em; centred (day view) or muted-right (settings) | day views, settings |
| `domain/BookFab` | 56px circle, accent fill, accent-tinted shadow, floats over the tab bar | `day-view-schedule` |
| `domain/MoneyValue` | tabular numerals + `EGP`. **Two orders**: `EGP 2,600` (B) and `2,600 EGP` (A price button) | everywhere |
| `domain/ToothBadge` | 46×37 bordered · dashed when unassigned · 38px mini · stacked code + "TOOTH" caption | visit screens |
| `domain/StatusChip` | completed (accent-soft) · in progress (surface-2, pulsing dot) · did not attend · cancelled. Tappable to cycle in edit | visit screens |
| `domain/BalanceStrip` | settled (accent) · outstanding / running (due) · neutral "—" · overpaid — dot + label + amount + optional ghost action | check-in, payment, visit edit/view |
| `domain/TotalRow` | canvas panel, label + strong amount; label flips "Total" ↔ "Running total" | check-in, visit edit |
| `domain/AppointmentRow` | upcoming (time, name, proc·duration, trailing check-in pill) · past (opacity .72, status text) · status dot + label · walk-in flagged | day views |
| `domain/MainCard` | 4 states — **in the chair** (progress + Finish), **waiting** (checked-in-at + wait in hot), **next up** (countdown), **empty chair**. Black card, enters with `promote` | `doctor-day-view` |
| `domain/CheckedInStrip` | white card, pulsing wa dot, name + subline, Finish pill | `doctor-day-view` |
| `domain/ReminderRow` | name, time · procedure, skip ✕, WhatsApp send → "Sent" muted. Bulk: Skip all / Send remaining | `day-view-schedule` |
| `domain/CalendarSheet` | 7-col month grid, 44px cells with a load bar, today filled, past dimmed, fully-booked tinted, legend, day summary, "Go to this day" | `day-view-schedule` |
| `domain/PatientRow` | name, phone · age · sex (mono), optional due in hot with a dot, chevron | patients |
| `domain/VisitRow` | date stamp (16px day / 9.5px month), procedure + variant, status pill, amount + due line, year group headers | patient record |
| `domain/QARow` | 150px label, right-aligned bold answer | patient record |
| `domain/ClinicQuestionField` | renders by answer type — yes/no, dropdown, short text, number (+ **date**, defined in settings but not rendered on the record). Required star; missing required turns the label hot; drives an "n of m answered" bar and a stateful save label | patient edit |
| `domain/ProcedureGroupCard` | grouped by tooth: header (tooth badge, position words, subtotal, chevron), lines (name + variant, EGP input, remove ✕), footer "Add to UL6". Collapsible. Dashed when unassigned. Read-only variant swaps inputs for text | check-in, visit edit/view |
| `domain/ToothPickerSheet` | search + 4 quadrant grids (8 × 38px), "No matching teeth", "No tooth assigned" skip. Add vs change mode changes title, hint and skip visibility | check-in, visit edit |
| `domain/CataloguePickerSheet` | category rows disclosing priced variant sub-lists; variantless categories pick directly; `picked` fills ink | check-in, visit edit |
| `domain/PaymentRow` | date stamp, method select, amount input, remove ✕ | visit edit |
| `domain/DueCard` | canvas panel, EGP + 34px figure, disclosure revealing the read-only procedure breakdown | payment |
| `domain/MethodTiles` | 2×2 grid, ≥56px, single-select Cash / Card / Instapay / Other; Other reveals free text; zone dims when paid is 0 | payment |
| `domain/PaymentDoneSheet` | 60px ring (accent check / owing / none) + title + body generated from the recorded amounts | payment |
| `domain/HeroCollectionCard` | rate % + due caption, split bar, three stats (collected / charged / due) with colour-coded dots. `older` and `discount` variants in CSS only | money |
| `domain/StatCard` | label / value + currency / sub. Variants: due, older, discount | money |
| `domain/TakingsCard` | total row then per-method rows: icon, animated bar, travelling % label, amount | money |
| `domain/DebtorRow` | name, "Outstanding <age>", EGP amount, chevron, staggered entry | money |
| `domain/DockingSearchPill` | animates between an inline slot and a floating pill above the nav; `is-docked` / `is-settling` / `is-offscreen`; clear button; auto-scrolls the list into view on first input | money |
| `domain/PeriodTabs` | horizontally scrolling pills, Today → All time | money |
| `domain/SettingsRow` | 32px icon tile (r10, ink@5%), label + sub, chevron | settings index |
| `domain/BranchCard` | name + "you are here" badge, address, stats; inactive variant with a dashed border | settings → branches |
| `domain/ConnectionStatus` | dot + animation + label + Retry with a spinning icon. Compact (in the black card) and full (server name, address, last-probe stamp) | settings |
| `domain/RoleSwitchSheet` | from → to card with an arrow, a checklist of effects, confirm + cancel | settings |
| `domain/WhatsAppPreview` | ink card, WA glyph + "WHATSAPP" + send stamp, white bubble with a tail corner, sample note | settings → reminders |
| `domain/ReminderTokenChip` | dashed pill with `+`; inserts `{{name}}` into the template | settings → reminders |
| `domain/DurationRow` | radio (set default) + mono value + Default tag + remove; draft input + Add; quick-add pills | settings → appointments |
| `domain/ProcedureListRow` | name + tags (checkup / qty / inactive), large tappable price (20px mono), chevron. Dimmed when inactive. Reorder mode swaps chevron for ↑/↓ and freezes the price | settings → procedures |
| `domain/PatientFieldRow` | label (Arabic face applied per string), type tag (`Dropdown · 8 options`) + Required tag, delete, chevron; reorder mode as above | settings → patient fields |
| `domain/FixedDetailsCard` | dashed card listing the five built-in details (Full name, Phone, Email, Age, Sex) as inert chips + a lock note explaining they can't be renamed, reordered or removed | settings → patient fields |
| `domain/FieldPreview` | live render of how the question appears on the patient record: yes/no pills, dropdown line + caret, date line + calendar glyph, number line, text line — with a "preview only" hint | settings → patient fields |

---

## 6. Cross-cutting behaviour

- **RTL** — `dir` on the frame; `margin-inline-start`, `inset-inline-start`,
  `padding-inline-start`; a `chevFlip` transform token; `[dir="rtl"]` overrides for
  the switch knob, price alignment, chevron mirroring, and the push-view direction.
- **Per-string script detection** — `settings-patient-fields` runs `hasAr()` on each
  value and applies the Arabic face to *that string*, not the screen. A clinic can
  hold Arabic and Latin question labels in one list. This is a stronger requirement
  than screen-level RTL and needs a shared text primitive.
- **Arabic-Indic numerals** — the same screen renders counts as `٥ أسئلة` via a digit
  map. No other design does this (see §7.11).
- **Localisation** — each plain-HTML design carries its own `T = { en, ar }` table and
  syncs through a `mawid-lang` localStorage key plus a `storage` listener.
- **Never destroy history** — both settings editors promise it in copy, by different
  means: procedures *deactivate* (kept on past visits); patient fields *delete* and
  the answers are "kept but hidden — not erased", recoverable by re-adding a field
  with the same label. Price edits are forward-only ("visits already recorded stay
  at 700 EGP").
- **Test hooks** — every meaningful region carries `data-od-id`
  (`pf-form-preview`, `money-owe-sort-v2`, `proc-row-p101`, …). A ready-made
  `testID` convention.
- **Responsive** — `@media (max-width: 430px)` drops the device frame and goes
  full-bleed, so the designs already describe real-phone layout.

---

## 7. Open questions

**7.1 Which token system wins?**
System A (Instrument Sans, warm `#f5f4f1`, blue accent) covers the day views,
patients and every settings screen. System B (SF Pro, white, green accent) covers
the whole visit-and-money flow. They are not reconcilable by tweaking values —
`--accent` is blue in A and green in B, `--ink #0e1116` vs `--fg #111114`, and the
radius and shadow scales differ. This blocks `ui/`, so it blocks everything.

**7.2 Fonts.**
System A depends on Instrument Sans + DM Mono + Noto Naskh Arabic (Google Fonts).
System B leans on the system stack, which on Android is Roboto, not SF Pro — the
letter-spacing and 620/680 weights in B assume SF and will not render as designed.
Either way something has to be bundled.

**7.3 Are the five palettes a feature?**
Every System A design ships a palette switcher (Clinic blue / Mint clinical / Warm
sand / Violet ink / Nile teal) plus a free-form accent. `SPEC.MD` §12 lists no
theming setting. Real feature, or an Open Design control to collapse to one palette?

**7.4 Two procedure data models.**
`check-in` / `appointment-edit-v3` use a hard-coded catalogue of categories with
*priced variants* (Composite filling → Class I–IV, each with its own cost).
`settings-procedures` models a category → procedure tree where each procedure has
one price and two flags (`qty`, `checkup`) and **no variants at all**. The visit
screens cannot be built from the settings model as designed. Which is right?

**7.5 Two designs open with a dead redirect.**
`appointment-view.html` and `visit-payment.html` both begin with
`window.location.replace('appointment-edit.html' + location.search)`, and
`appointment-edit.html` no longer exists in the project folder (only `-v3` does).
Superseded, or a stale redirect on current designs? `payment-screen-plan.md` says
`visit-payment.html` is the built, current payment screen — contradicting its own
redirect.

**7.6 Overpayment: allowed or not?**
`visit-payment.html` clamps the amount paid to the amount due and toasts "Can't pay
more than the amount due" (`payment-screen-plan.md` Q2 resolves it as *not
allowed*). `appointment-edit-v3.html` renders an "Overpaid — refund due" state.
One of these is wrong.

**7.7 The checkup-fee waiver has no screen.**
`settings-procedures` promises "waived automatically when any other work is done
that visit", and only one procedure can hold the flag. No visit design shows the
waiver applying, being explained, or being overridden.

**7.8 Two removal semantics across two settings screens.**
Procedures are *deactivated* and never deleted ("past visits still reference them").
Patient fields are *deleted*, with answers "kept but hidden" and recoverable only by
re-creating a field with the same label. `patient-view.html` meanwhile says
"deactivated questions keep their answers but stop showing" — which describes the
procedures model, not the one `settings-patient-fields` actually implements. Pick one
verb and one guarantee.

**7.9 The `date` answer type has no renderer.**
`settings-patient-fields` offers five answer types (yes/no, dropdown, short text,
number, date) and previews all five. `patient-edit.html` renders only four — there
is no date control on the patient record.

**7.10 Tab bar — rule settled, designs not yet updated.**
The bar is always four items: Day · Patients · Money · role tab, and only the fourth
changes — **Doctor** or **Secretary** depending on the active role. The designs
disagree with that and with each other: `doctor-day-view` labels the fourth tab
"Doctor", `settings.html` labels it "Settings" (`الإعدادات`), and `patients-list`,
`patient-view` and `money-dashboard-v2` draw only three tabs with no role item at
all. Still to confirm: does the role tab land on Settings — `SPEC.MD` §6 puts
settings under the doctor view — and does the secretary's role tab go somewhere
different, or to the same screen with fewer rows?

**7.11 Numeral rendering in Arabic.**
`settings-patient-fields` converts counts to Arabic-Indic digits (`٥`). Money,
prices, times and durations everywhere else stay Latin, and `DM Mono` has no
Arabic-Indic coverage. Decide once: which numbers localise, and what happens to the
mono/tabular alignment when they do.

**7.12 Money formatting rule.**
The hero and stat cards use compact numbers (`142.6k`); the takings card uses full
(`EGP 142,600`); rows use `EGP 15,000`. And `CLAUDE.MD` requires integer piastres
end to end, while every design shows whole EGP. One format-at-the-edge rule is
needed, including whether piastres are ever shown.

**7.13 Currency position.**
`EGP 2,600` in System B vs value-then-`EGP` in System A price controls. Arabic needs
a third answer (`ج.م`, already used in the `settings-procedures` copy).

**7.14 No designs for sync, loading or failure.**
The only offline artefact is one banner on the day view. There is nothing for the
offline write queue, a failed sync, a stale-data indicator, or list loading — and
`SPEC.MD` §14/§15 make the clinic-local server a first-class concern.

**7.15 Undo has no target.**
"Visit deleted · Undo" is rendered as toast *text*. The toast has no tappable
region. Either it needs an action slot or deletion needs a different pattern.

**7.16 Avatars: keep or drop?**
Patient data carries an `ini` (initials) field and the money dashboard defines
`.debtor-card .avatar` styling, but neither final markup renders one. The settings
role card is the only place an avatar actually appears.
