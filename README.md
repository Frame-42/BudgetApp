# BudgetApp

A React Native (Expo SDK 57) budgeting app for iPhone, ported from the **iPhone
Budgeting App** design canvas: five screens, monochrome graphite, colour spent
only on status.

Everything on screen is computed from SQLite on the device. There is no account,
no server and no network call anywhere in the app — the schema is built so that
adding sync later is a new module rather than a migration, but nothing syncs
today.

- **[AGENTS.md](AGENTS.md)** — the rules that are easy to get wrong, and how to
  verify a change on a simulator. Read it before changing code.
- **[ROADMAP.md](ROADMAP.md)** — what is missing, in priority order, with the
  reasoning behind each gap.

---

## Run

```bash
npm install
npm run ios          # expo run:ios — builds and installs a dev build
```

`npm run ios` is `expo run:ios`, which compiles the native project and installs
a **development build** on the simulator. It needs Xcode and CocoaPods; the iOS
deployment target is pinned to 16.4 by `expo-build-properties` in `app.json`.
The first build takes a few minutes, subsequent ones are incremental. `npm run
android` is the same thing via Gradle, and has never actually been run — see the
roadmap.

For JS-only work the classic loop still applies:

```bash
npx expo start       # opens in Expo Go
```

Every dependency in `package.json` ships inside Expo Go, so nothing here forces
a native build until you add a package that does. Prefer `npx expo install` over
`npm install` so versions stay pinned to the SDK.

Fonts (Geist, Geist Mono) are bundled via `@expo-google-fonts` and loaded in
`App.tsx`; the app renders a flat background until they are ready.

### The native projects are generated, not committed

`ios/` and `android/` are gitignored. They are output of `npx expo prebuild`,
and everything that shapes them — bundle identifier, Android package, icons,
plugins, deployment target — lives in `app.json`. Change `app.json`, not the
Xcode project; a hand edit inside `ios/` is erased by the next prebuild.

### Checks

```bash
npx tsc --noEmit     # the only check that exists; keep it clean
```

There is no test runner and no linter yet. `src/queries/`, `src/import/`,
`src/format.ts` and `src/time.ts` are written as pure functions specifically so
`jest-expo` can be added without rework.

---

## Screens

| # | Screen | What it does | File |
|---|--------|--------------|------|
| 01 | **Home** | On track at a glance — ring, pace, next out | `src/screens/HomeScreen.tsx` |
| 02 | **Spend** | Every transaction: month stepper, search, category filters, tap a row to edit or delete it | `src/screens/SpendScreen.tsx` |
| 03 | **Add** | Expense entry on a live keypad, with what's left to spend above it | `src/screens/AddScreen.tsx` |
| 04 | **Trends** | 3/6/12-month shape, narrowable by category, with a split donut | `src/screens/TrendsScreen.tsx` |
| 05 | **You** | What's been tracked, settings, import and export | `src/screens/YouScreen.tsx` |

Two screens sit outside the tab bar:

- **Onboarding** (`OnboardingScreen.tsx`) — a welcome and four steps: name and
  employment, the monthly budget, which categories to keep (plus the weekly
  recap toggle), and a limit per kept category. It runs once, gated on
  `sync_meta.onboarded_at`, and writes everything in one transaction.
- **Budget editor** (`BudgetScreen.tsx`) — a full-screen modal opened from You's
  *Monthly budget* row. It is onboarding's steps 2 and 4 on one page, prefilled,
  because the overall figure and the per-category limits are one decision.

Trends hands its scope — the picked month or span, plus the selected categories
— straight to Spend's list through `feed.focus()` in `App.tsx`. That hand-off is
the whole of the navigation between them, and it is why the two screens always
agree on what is being looked at.

---

## Layout

| Path | Holds |
|---|---|
| `src/theme.ts` | Design tokens — the white-overlay surface scale, the two accent tints (converted from `oklch`), radii, the Geist stack |
| `src/components/primitives.tsx` | `Card`, `HeroCard`, `Background`, `Divider`, `Eyebrow`, `Amount`, `T`, `StatusDot` — every screen is built from these |
| `src/components/` | `Charts.tsx` (ring, pace lines, split donut in `react-native-svg`), `TabBar.tsx` (the pill nav), `Keypad.tsx`, the sheets, and `BudgetAmountCard`/`CategoryLimits` shared by onboarding and the budget editor |
| `src/screens/` | One per tab, plus onboarding and the budget editor; presentational, fed by props |
| `src/db/` | `client.ts` (opens, migrates, seeds), `migrations.ts`, `seed.ts`, `demo.ts`, `onboarding.ts`, `budget.ts`, `import.ts`, `export.ts` |
| `src/repo/` | Typed CRUD per table — the only place writes happen, and the only place sync columns are stamped |
| `src/queries/` | The derived figures each screen shows, as pure functions: rows in, numbers out |
| `src/import/` | Bank-export reading — `csv.ts`, `rules.ts` (MCC plus merchant memory), `plan.ts` (the review queue) |
| `src/export/` | CSV writing — `csv.ts` (the serializer), `share.ts` (file plus share sheet) |
| `src/state/` | `BudgetProvider.tsx` and the two screens that own their own queries |
| `src/devtools/` | The runtime dev-mode flag and the dev-only actions card |
| `src/sync/` | The `SyncEngine` interface and its no-op default |
| `src/format.ts`, `src/time.ts` | Money and date formatting — the only place either happens |

`src/state/BudgetProvider.tsx` opens the database once and recomputes every
screen's figures whenever a row changes. Spend and Trends are the two
exceptions: both take query arguments — a period, a search term and a set of
categories — which an argument-free "recompute everything" shape cannot express,
so `useTransactionFeed.ts` and `useTrendsView.ts` each hold their own arguments
and subscribe to the change events themselves. That is deliberate; don't tidy
them back into the provider.

---

## Data

SQLite via `expo-sqlite`, on device, opened with `enableChangeListener` so the
app learns about its own writes.

`src/db/migrations.ts` holds the ordered DDL, tracked in `PRAGMA user_version`
and append-only — a shipped step is never edited, because devices have already
run it. Six tables sync (`accounts`, `categories`, `transactions`, `budgets`,
`recurring`, `settings`); `outbox` and `sync_meta` are local only.

The first run plants seven categories and one Checking account, and then stops:
everything else — name, employment, the budget, the limits, the recap
preference — comes from onboarding. Months of history for the charts live in
`src/db/demo.ts` and are reachable only from the dev tools.

Three rules run through the whole codebase:

- **Money is integer cents, everywhere.** Never a float, never a formatted
  string in the database. Format only via `src/format.ts`, where the euro symbol
  trails the figure ("1,240 €").
- **Amounts are signed** — negative is money out, positive is money in.
  Aggregates filter on `amount_cents < 0` for spending.
- **Account balances are derived** from an opening balance plus transactions,
  never stored. A stored balance is the hardest field to reconcile between
  devices.

### Budgets carry forward

`monthlyBudgetCents` and `effectiveLimits` both resolve with `month <= ? ORDER
BY month DESC`, so one month's rows cover every month after it, and a budget
edit only ever writes the *current* month. Back-dating would hand the Trends
bars a budget those months never had.

"This month only" is therefore not a scope on this month but a **pin on the
next**: the editor writes the figure that was already in force in the following
month, which is what stops this month's rows carrying any further. A cleared
category limit is written as an explicit zero for the same reason — writing
nothing would leave an earlier month's row still applying, so the edit would
silently not take. A zero row reads as "no limit" everywhere.

### Import and export round-trip

`src/export/csv.ts` writes exactly the columns `src/import/plan.ts` reads —
`datetime, amount, name, category, note, transaction_id` — so a file that leaves
the app comes back as the same transactions rather than a review queue. An
export this app cannot read back would be a report, not a backup.

Re-importing an overlapping file is safe: `transactions.external_id` holds the
bank's own id (or the app's row id, for anything typed by hand) and a row whose
id is already present is skipped. Rows without one get a fuzzy check — same
cents, ±3 days, same merchant key — which only ever *flags*, because one
afternoon can legitimately hold two runs to the same shop.

Categorisation resolves in one order: securities purchase → what the user has
previously chosen for that merchant → a `category` column naming a category the
app has → MCC table → review. The bank's own column sits below the memory
deliberately: in a bank's file that column is a guess, and a guess must not
outrank a decision the user already made. Nothing is ever auto-filed as "Other".

### Ready to sync, not yet syncing

The schema is built so that adding an account later is a new module rather than
a migration:

- UUID primary keys, so two devices can write offline without colliding
- `updated_at` on every row — last write wins, ties broken by `device_id`
- `deleted_at` soft deletes, so a deletion is a fact that can propagate
- an `outbox` table fed by SQLite triggers rather than by the repositories, so
  no write path can bypass it — including ones added years from now
- `owner_id`, NULL until first sign-in, when one UPDATE claims the local rows

`src/sync/types.ts` defines the two methods (`pull`, `push`) a backend has to
implement; `src/sync/local.ts` is the no-op default. Nothing above the
repository layer knows or cares which backend is in use. The outbox currently
fills and is never drained — see P0 in the roadmap.

---

## Developer tools

There is one app, not a separate "dev" build — a runtime toggle instead. In a
`__DEV__` run, the You screen's settings list gets a **Developer mode** row, on
by default:

- **On** — a *Dev tools* card appears below Settings with "Reset to first run"
  and "Load sample data" (`src/devtools/DevToolsPanel.tsx`).
- **Off** — that card disappears and the screen looks exactly like the finished
  product, no rebuild needed.

The flag lives in `src/devtools/DevToolsContext.tsx` and resets to on each fresh
dev session. A production build never shows the row at all — `__DEV__` is false
there, so the toggle and the tools it guards don't exist. New dev-only actions
belong in `DevToolsPanel.tsx`'s `tools` array, not as another ad-hoc `__DEV__`
check inside a screen.

---

## Licence

MIT — see [LICENSE](LICENSE).
