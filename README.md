# BudgetApp

React Native (Expo) implementation of the **iPhone Budgeting App** design canvas —
five screens, monochrome graphite, colour spent only on status.

Imported from the Claude Design project `Budget Home.dc.html` → `Phone.dc.html`.

## Run

```bash
npm install
npx expo start --ios   # or --android
```

Opens in Expo Go — no native build needed. Fonts (Geist, Geist Mono) are bundled
via `@expo-google-fonts`.

## Screens

| # | Screen | File |
|---|--------|------|
| 01 | Home — on track at a glance | `src/screens/HomeScreen.tsx` |
| 02 | Spend — where it went | `src/screens/SpendScreen.tsx` |
| 03 | Add — expense entry (live keypad) | `src/screens/AddScreen.tsx` |
| 04 | Trends — six-month shape | `src/screens/TrendsScreen.tsx` |
| 05 | You — accounts and settings | `src/screens/YouScreen.tsx` |

## Layout

- `src/theme.ts` — the design's tokens: the white-overlay surface scale, the two
  accent tints (converted from `oklch`), radii, and the Geist font stack.
- `src/components/primitives.tsx` — `Card`, `HeroCard`, `Divider`, `Eyebrow`,
  `Amount`, `T`, `StatusDot`. Every screen is built from these.
- `src/components/Charts.tsx` — budget ring, pace lines, split donut
  (`react-native-svg`, geometry copied from the source SVGs).
- `src/components/TabBar.tsx` — the pill nav; the active tab expands to show its
  label via `LayoutAnimation`.
- `src/data.ts` — all screen content, in one place to swap for real data.
