# DESIGN.md

The visual and interaction design of BudgetApp: what the app looks like, how it
moves, and the rules that keep new screens looking like the existing ones.

[AGENTS.md](AGENTS.md) holds the engineering rules and [ROADMAP.md](ROADMAP.md)
what is missing. This file is about the surface. Where a rule here is enforced
by code, the file is named so the two can be kept in step — if they disagree,
the code is what ships, and this file should be corrected.

## Origin

The app is a port of the **iPhone Budgeting App** Claude Design canvas
(`Budget Home.dc.html` → `Phone.dc.html`, plus `Onboarding Phone.dc.html`).
`src/theme.ts` is a transcription of that canvas's tokens. Three things are
ours rather than the canvas's: the light scheme, the per-category limits in
onboarding step 4, and everything behind Add's "Advanced" pill.

## Principles

1. **Monochrome. Colour is reserved for status.** Every surface is one overlay
   colour at a low alpha. The only chroma is a cool blue accent, used for the
   on-track dot, positive deltas, income and the text caret. A new hue is a
   design decision, not a styling one.
2. **The figure is the hero.** Each screen leads with one large light-weight
   number under a small uppercase label. Everything else is quieter than it.
3. **Hierarchy comes from alpha, not from colour or weight.** Text steps down
   through opacity tiers of one foreground colour; category shades are one mark
   colour at different alphas.
4. **One movement.** Anything that changes layout in place uses the same 280ms
   ease. Going back may be quicker than arriving; nothing is slower.
5. **Say what is true.** A month with no transactions is missing data, not a
   month of zero spending, and is drawn grey and unpickable. A limit that was
   never set is not a limit of zero. The design never invents a figure.

## Colour

Two palettes, built by `palette(scheme)` in `src/theme.ts`: **graphite** (dark,
the scheme the design was drawn in) and its inversion over a **pearl** ground
(light). Every token keeps its role across the two; only its value changes.

### The three alpha functions

| Function | Dark base | Light base | Used for |
|---|---|---|---|
| `w(alpha)` | white | ink `#17181c` | Surfaces, borders, hairlines |
| `fg(alpha)` | `#f4f5f7` | ink `#17181c` | Body copy and its quieter tiers |
| `mark(alpha)` | `#e9ebf2` | `#282b34` | Chart fills and category shades |

### Named tokens

| Token | Dark | Light | Role |
|---|---|---|---|
| `text` | `#f4f5f7` | `#17181c` | Default copy |
| `textBright` | `#f7f8fa` | `#17181c` | Hero figures |
| `textStrong` | `#f2f3f7` | `#17181c` | Filled surfaces such as the active pill |
| `ink` | `#0d0e12` | `#fffefc` | Text on a `textStrong` fill |
| `mark` | `#e9ebf2` | `#282b34` | Filled bars, active chart marks |
| `accent` | `#a9b8d5` | `#7384ab` | Status dot |
| `accentBright` | `#b4c4e5` | `#4d6090` | Positive deltas, income, caret, selection |
| `accentGlow` | `rgba(155,183,242,.55)` | `rgba(96,120,178,.4)` | The dot's glow |
| `accentLine` | `rgba(180,196,229,.4)` | `rgba(77,96,144,.4)` | An armed destructive action's outline |
| `bg` | `#14161c → #0d0e12 → #0b0c10` | flat `#f6f4ef` | Page ground (178°, stops 0 / .34 / 1) |
| `hero` | `w(.075) → w(.025)` at 165° | `#fffefc` | Lead tile |
| `tile` / `tileBorder` | `w(.04)` / `w(.06)` | `#fffefc` / `#e7e4de` | Flat card |
| `tileQuiet` / border | `w(.03)` / `w(.055)` | same as `tile` | Secondary card |
| `sheet` | `#171921` | `#fffefc` | Bottom sheets — opaque on purpose |
| `scrim` | `rgba(11,12,16,.72)` | `rgba(246,244,239,.72)` | Bars floating over scrolling content |
| `hairline` | `w(.055)` | `#e7e4de` | Rules |
| `track` | `w(.08)` | `w(.08)` | Rails and progress tracks |

Why the two schemes differ in shape, not just value:

- **Dark overlays, light lifts.** White-on-graphite reads as raised, so dark
  cards are translucent overlays. In light the cards are an opaque warm white
  *above* the pearl ground, with one card colour and one border for every tier —
  quiet tiles only differ in dark because an overlay cannot be made quieter any
  other way.
- **The ground is pearl, not white, and flat.** The dark ground falls away
  through a gradient; the light one does not.
- **The accents keep their hue and drop in lightness** in light, or they would
  vanish into the ground.
- **Sheets are opaque** in both. They sit over blurred content, and an alpha
  surface would let the list read through.

### Using colour

- Read `color`, `w`, `fg` and `mark` from `useTheme()` inside a component.
- A stylesheet that uses any of them is `makeStyles((theme) => ({…}))`, called
  as a hook. It caches one sheet per scheme.
- **No literal `rgba(…)` or hex in a component.** It would stay dark in light
  mode. Add a token to both palettes instead.
- Appearance is `SYSTEM | DARK | LIGHT`, stepped from the You screen. The
  default is System in a release build and Dark while `__DEV__`.

### Category shades

A category has no colour of its own, only a `color_alpha` on the `mark` scale.
Brightness tracks how large the category usually is, not its position in the
list, so Housing (.95) and Investment (.80) are the brightest and Misc (.16) the
faintest. In charts, selection is shown by **dimming the others**
(`dimAlpha` in `Charts.tsx`), never by filtering them out.

## Typography

Two families, bundled through `@expo-google-fonts` and loaded in `App.tsx`:
**Geist** for copy and figures, **Geist Mono** for micro-labels.

| Token | Face |
|---|---|
| `light` | Geist 300 — hero figures |
| `regular` | Geist 400 — body |
| `medium` | Geist 500 |
| `semibold` | Geist 600 |
| `mono` | Geist Mono 400 |
| `monoMedium` | Geist Mono 500 — eyebrows |

The recurring styles, all from `src/components/primitives.tsx`:

| Component | Style | Use |
|---|---|---|
| `Amount` | Geist Light 54, tracking −0.035em, `textBright`; a 26pt "€" at alpha .42 on the same baseline | The hero number |
| `T` | Geist 12.5 regular by default; size, weight, alpha and tracking as props | All other copy |
| `Eyebrow` | Geist Mono Medium 9.5, uppercase, tracking +0.16em, alpha .34 | The label above a value |
| `TextField` | Mirrors `T` exactly | The only keyboard text entry |

Rules:

- **Tracking is given in em** and converted with `track(em, size)`, because the
  canvas is CSS and React Native wants points.
- **Never pass a tight line height.** The canvas uses values like `54px/.94`,
  which crop Geist's ascenders on iOS. `primitives.tsx` clamps every line height
  up to `size × 1.15`; leave the clamp in place.
- Text alpha `1` resolves to `color.text`; anything lower goes through
  `fg(alpha)`. Placeholders are `fg(.3)`.

## Money and numbers

Formatting lives only in `src/format.ts`.

- **The euro symbol trails the figure**: `1,240 €`, never `€1,240`.
- Thousands are grouped with a comma.
- Hero figures are whole euros (`figure`); the `Amount` component adds the
  symbol.
- A transaction amount shows cents below a thousand and drops them from a
  thousand up: `6.40 €` beside `4,200 €` (`amountLabel`).
- Signs use a true minus `−`, and `+` only where the sign is the point.
- Spending is shown as a positive figure; the sign lives in the data.

## Shape and spacing

| Token | Value | Use |
|---|---|---|
| `radius.hero` | 26 | Lead tile |
| `radius.card` | 24 | Cards and field surfaces |
| `radius.tile` | 22 | Smaller tiles |
| `radius.key` | 16 | Keypad keys |
| `radius.pill` | 999 | Chips, rails, the tab bar |
| `GUTTER` | 20 | Horizontal padding of the scrolling column |

Every card carries a 1pt border in its matching border token. There are no drop
shadows; the only glow in the app is the status dot's.

## Surfaces

| Surface | Component | When |
|---|---|---|
| Page ground | `Background` | Once per screen tree, and again inside full-screen Modals |
| Hero | `HeroCard` | The one lead tile on a screen |
| Card | `Card` | Standard content |
| Quiet card | `Card quiet` | Secondary content: "Coming up", insights, sign out |
| Field | `FieldSurface` | Any container around a `TextField` |
| Sheet | `Sheet` | Actions and pickers over the current screen |
| Divider | `Divider` | A 1pt rule that fades out to the right |

## Components

**Navigation**

- `TabBar` — a floating pill rail, 46pt tall. Only the active tab shows its
  label, which grows in as the pill widens over 280ms. Five tabs: Home, Spend,
  Add, Trends, You.
- `SegmentedPill` — the same rail-and-thumb as the tab bar, sized for text. The
  thumb slides rather than cuts, because its two labels describe the same edit
  with a different reach.

**Input**

- `Keypad` — the amount keypad on Add. No second decimal point, and no seventh
  digit.
- `CategoryChips` / `Chip` — single-select pills. Past six, the tail folds
  behind a "More" chip, unless that would hide one chip or none.
- `BudgetAmountCard` and `CategoryLimits` — the budget rail and the per-category
  fields. Onboarding and the budget editor share them; change one and both move.
- `DateCard`, `SplitCard`, `RepeatCard` — Add's advanced options, in that order.
- `MonthStepper` — carets, a swipeable month label and a tap-for-choices pill,
  shared by Spend and the day picker.

**Display**

- `TransactionRow` — one line of the Spend list.
- `StatusDot` — the 6pt accent dot with its glow. The one spot of colour.
- Charts (`Charts.tsx`): `CommitmentBar` (Home's spent / planned / free rail;
  planned is the mark at a lower alpha, not a new hue), `PaceChart` with its solid and dashed
  `LegendRule`, and `SplitDonut`. On the month in progress the solid line carries
  on past today as the forecast: the same stroke and the same smoothed path at
  `mark(.3)`. It has no legend row. The dashed comparison stays the chart's only broken line.
- Icons (`Icons.tsx`) — hand-drawn line icons taking `color` and `size`. There
  is no icon library.

### The donut

`SplitDonut` shows the **four largest categories and then "Other"**. "Other" is
always last and is only ever the categories outside the four; it is never a
category of the user's (their catch-all is **Misc**, which ranks like any
other). If exactly five categories have spending, all five are named. Selecting
a slice dims the rest; it does not redraw the ring as 100% of itself.

## Motion

- **`morph()`** in `src/motion.ts` is the app's one layout animation: 280ms,
  ease-in-ease-out, with created and removed views fading. Use it for anything
  that changes layout in place — a sheet stepping forward, a chip row expanding.
  A dismissal may pass a shorter duration.
- Things that are positioned rather than laid out (the segmented thumb) use a
  plain `Animated` value at the same 280ms.
- **Horizontal swipes** — the Trends period pager and Spend's month selector —
  are both decided by `isHorizontalSwipe`, so they feel the same. A drag is
  claimed once it leads vertical movement, and held more loosely after 18pt.
- **Sheets** drag down to dismiss and spring back if released early.

## Haptics

Three, all through `src/haptics.ts`, all fire-and-forget:

| Call | Feel | When |
|---|---|---|
| `tapSelect` | Selection tick | A choice landed: a chip, a menu row |
| `tapWarn` | Warning | A destructive action is armed and waiting for a second tap |
| `tapDone` | Success | The write went through |

## Interaction rules

- **A field's whole surface is its touch target.** Wrap a field in
  `FieldSurface`, not a `View` or `Card`, so a tap anywhere on the visible pill
  focuses it. The one exception is `BudgetAmountCard`'s typing row, where a tap
  outside the digits is meant to dismiss.
- **Destructive actions take two taps.** The first arms the action — the outline
  turns `accentLine` and `tapWarn` fires — and the second confirms. Nothing is
  confirmed through a system alert; those are kept for failures.
- **A tappable settings row carries a chevron; a read-only one does not.**
- **Add is the one form**, for new transactions and edits alike. Sheets hold
  actions only, never a second copy of the form.
- **Options that are hidden do not apply.** Closing Add's "Advanced" section
  resets what was inside it.
- **Nothing in the future is pickable.** Date pickers and the month stepper stop
  at today and the current month.

## Screens

| Screen | Leads with | Notes |
|---|---|---|
| Home | Left to spend this month | Spent / planned / free rail, month-end forecast, daily pace, this week's bars, category limits, "Coming up" |
| Spend | The transaction list | Scrolls itself (`SectionList`); month stepper, search, category filter |
| Add | The amount, on the keypad | Category chips, a name field, the "Advanced" pill |
| Trends | The span's monthly average | Month bars, pace curve, the donut; hands its scope to Spend |
| You | Money tracked | Settings rows (monthly budget, categories, weekly recap, appearance), import and export |
| Onboarding | A welcome, then four steps | Name, budget, categories, limits |
| Budget editor | The monthly budget | A full-screen Modal over You |

Screens are presentational and fed by props. Figures are derived in
`src/queries/`.

## Adding to the design

Before introducing something new, check in this order:

1. Is there already a primitive for it? Most new UI is `Card` + `Eyebrow` + `T`.
2. Can the hierarchy be expressed with an existing alpha tier?
3. Does it move with `morph()`?
4. Does it read correctly in **both** schemes? Check light mode before calling
   it done.

A new token goes into both palettes in `src/theme.ts`. A new hue, a new radius
or a second animation curve is a change to the design itself and should be
decided as one.
