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
| 02 | Spend — every transaction: month stepper, search, category filters | `src/screens/SpendScreen.tsx` |
| 03 | Add — expense entry (live keypad) | `src/screens/AddScreen.tsx` |
| 04 | Trends — 3/6/12-month shape, narrowable by category | `src/screens/TrendsScreen.tsx` |
| 05 | You — accounts and settings | `src/screens/YouScreen.tsx` |

## Layout

- `src/theme.ts` — the design's tokens: the white-overlay surface scale, the two
  accent tints (converted from `oklch`), radii, and the Geist font stack.
- `src/components/primitives.tsx` — `Card`, `HeroCard`, `Divider`, `Eyebrow`,
  `Amount`, `T`, `StatusDot`. Every screen is built from these.
- `src/components/Charts.tsx` — budget ring, pace lines, split donut
  (`react-native-svg`), all driven by the numbers in `src/queries/`.
- `src/components/TabBar.tsx` — the pill nav; the active tab expands to show its
  label via `LayoutAnimation`.

## Data

Everything on screen is computed from SQLite (`expo-sqlite`), on device.

- `src/db/` — `client.ts` opens the database, `migrations.ts` holds the ordered
  DDL (tracked in `PRAGMA user_version`), `seed.ts` writes six months of demo
  history on first run.
- `src/repo/` — typed CRUD per table. The only place sync columns are stamped.
- `src/queries/` — the derived figures each screen shows, as pure functions.
- `src/state/BudgetProvider.tsx` — opens the database once and recomputes every
  screen's figures whenever a row changes.
- `src/state/useTransactionFeed.ts`, `src/state/useTrendsView.ts` — the two
  exceptions: Spend's list is filtered and paged and Trends narrows by category,
  so each holds its own query arguments and subscribes to the change events
  itself. Trends hands its scope — period plus categories — to the Spend list
  through `feed.focus()`, which is how the two screens stay one filter.
- `src/format.ts` — money is stored as integer cents and formatted only here.

Money is signed: negative is out, positive is in. Account balances are derived
from an opening balance plus transactions, never stored.

### Ready to sync, not yet syncing

The schema is built so that adding an account later is a new module rather than a
migration:

- UUID primary keys, so two devices can write offline without colliding
- `updated_at` on every row — last write wins, ties broken by `device_id`
- `deleted_at` soft deletes, so a deletion is a fact that can propagate
- an `outbox` table fed by SQLite triggers, giving an ordered change log
- `owner_id`, NULL until first sign-in, when one UPDATE claims the local rows

`src/sync/types.ts` defines the two methods (`pull`, `push`) a backend has to
implement; `src/sync/local.ts` is the no-op default. Nothing above the repository
layer knows or cares which backend is in use.

## Developer tools

There's one app, not a separate "dev" build — a runtime toggle instead. In a
`__DEV__` run (the normal `expo start` workflow), the You screen's settings list
gets a "Developer mode" row, on by default:

- **On** — a *Dev tools* card appears below Settings with "Reset to first run"
  and "Load sample data" (`src/devtools/DevToolsPanel.tsx`).
- **Off** — that card disappears and the screen looks exactly like the finished
  product, no rebuild needed.

The flag lives in `src/devtools/DevToolsContext.tsx` and resets to on each fresh
dev session. A real production build never shows the row at all — `__DEV__` is
false there, so the toggle and the tools it guards don't exist.
