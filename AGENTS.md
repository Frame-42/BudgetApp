# AGENTS.md

Working notes for agents in this repo. Read before changing code.

## What this is

A React Native (Expo SDK 57) budget app, ported from a Claude Design canvas
(`Budget Home.dc.html` → `Phone.dc.html` in design project
`f7ad0a0f-1754-40df-868a-d1e1bb131210`). Five screens, monochrome graphite,
backed by on-device SQLite.

**Expo has changed.** Check the versioned docs at
https://docs.expo.dev/versions/v57.0.0/ rather than relying on memory of older
SDKs — several APIs used here (`expo-sqlite`'s async API, `expo-font` as a config
plugin) were reshaped after SDK 50.

## Commands

```bash
npm install
npx expo start --ios     # opens in Expo Go
npx tsc --noEmit         # the only check that exists; keep it clean
```

There is no test runner and no linter configured. `src/queries/` is written as
pure functions specifically so `jest-expo` can be added later without rework.

## Hard constraint: Expo Go

This machine has **no CocoaPods and no dev-client build**. Anything requiring a
custom native build (WatermelonDB, op-sqlite, PowerSync, react-native-mmkv) will
break the only working dev loop. Check a package ships in Expo Go before adding
it, and prefer `npx expo install` over `npm install` so versions match the SDK.

## Layout

| Path | Holds |
|---|---|
| `src/theme.ts` | Design tokens — surfaces, the two accent tints, radii, fonts |
| `src/components/` | `primitives.tsx` (Card, HeroCard, T, Amount…), `Charts.tsx`, `TabBar.tsx`, `Icons.tsx` |
| `src/screens/` | One per tab, plus `OnboardingScreen`; presentational, fed by props |
| `src/db/` | `client.ts`, `migrations.ts`, `seed.ts`, `demo.ts`, `onboarding.ts`, `types.ts`, `ids.ts` |
| `src/repo/` | Typed CRUD per table — the only place writes happen |
| `src/queries/` | Derived figures per screen; pure, rows in / numbers out |
| `src/state/BudgetProvider.tsx` | Opens the DB, recomputes on every change |
| `src/sync/` | The `SyncEngine` interface and its no-op default |
| `src/format.ts`, `src/time.ts` | Money and date formatting |

## Rules that are easy to get wrong

**The first run is gated, and the seed is not demo data.** `seedIfEmpty` plants
only the seven categories and one Checking account — the account is what makes its
`COUNT(*) FROM accounts` guard work, so never reduce it to categories alone.
Everything else comes from onboarding (`src/db/onboarding.ts`), which writes name,
employment, the monthly budget and the weekly-recap preference in one transaction.
It is a port of the `Onboarding Phone.dc.html` canvas — four steps, and the canvas
never asks for a balance, so Checking keeps its opening figure of zero. The gate is `sync_meta.onboarded_at`
— local-only and never synced, so `resetDatabase()` clears it and a second device
onboards again. `src/db/demo.ts` holds the months of history the charts need; it is
reachable only from the `__DEV__` rows on the You screen.

**Deselecting a category archives it.** `archiveCategory`, never a delete —
`listCategories` filters `archived = 0` so it leaves the chips, while `queries/trends.ts`
joins without that filter so old spending keeps its label.

**Money is integer cents, everywhere.** Never floats, never a formatted string in
the database. Format only via `src/format.ts`. The euro symbol *trails* the
figure ("1,240 €"), including in the `Amount` component.

**Amounts are signed**: negative is money out, positive is money in. Aggregates
filter on `amount_cents < 0` for spending.

**All writes go through `src/repo/`.** `repo/crud.ts` stamps `updated_at` in one
place; a raw `INSERT` elsewhere silently breaks sync ordering.

**Never hard-delete a syncable row.** Use `softDeleteRow` — a deletion has to be
a fact the server can learn about, which an absent row can't express. Reads go
through `listAlive`, which filters `deleted_at IS NULL`.

**Account balances are derived** (`opening_balance_cents` + transactions) and
must stay that way. A stored balance is the hardest field to reconcile between
devices.

**The outbox is trigger-fed.** Don't insert into it by hand; the triggers in
migration v1 cover insert/update/delete on every synced table. It grows until a
real sync engine calls `acknowledge()`.

**Schema changes append a migration.** Never edit a shipped entry in
`MIGRATIONS` — devices have already run it. `PRAGMA user_version` tracks position.

**Keep `enableChangeListener: true`** in `openDatabaseAsync`. Without it the app
writes to disk but never learns about its own writes, and the UI silently stops
updating. This has already been hit once.

**Don't pass tight line heights to `T`.** The CSS source uses `54px/.94`, which
crops Geist's ascenders on iOS. `primitives.tsx` clamps everything to
`size * MIN_LEADING` (1.15); leave the clamp in place.

**Colour is reserved for status.** The palette is white-at-an-alpha over
graphite, plus the two accent tints in `theme.ts` for on-track status and income.
Introducing a new hue is a design decision, not a styling one.

## Verifying changes on this machine

The live simulator panel (`mcp__Claude_Code_iOS_Simulator__control`) is **blocked**
— `/var/db/xcode_select_link` is missing, and the fix needs the user's password:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

Until that is run, there is no touch injection. What does work:

**`/reload` is unreliable, and Fast Refresh is not a substitute.** A source edit
triggers Fast Refresh, which *preserves module state* — including the memoized
`getDb()` handle. Anything that touches the database on disk (deleting `budget.db`
to force a first run, checking that `seedIfEmpty` reran) needs a real cold start, or
the app keeps using its already-open connection and nothing appears to change:

```bash
xcrun simctl terminate booted host.exp.Exponent
xcrun simctl openurl booted "exp://<lan-ip>:8081"   # lan-ip is in the expo start output
```

```bash
# screenshot the booted simulator
xcrun simctl io booted screenshot /Users/frame/Projects/BudgetApp/.shots/shot.png

# force a JS reload without a cold start (keeps Expo Go's dev-menu sheet away)
curl -X POST http://localhost:8081/reload

# cold start on a new bundle
xcrun simctl terminate booted host.exp.Exponent
xcrun simctl openurl booted "exp://<lan-ip>:8081"
```

Bash tool calls that write files via `simctl` need absolute paths and
`dangerouslyDisableSandbox`, or they fail with a read-only filesystem error.

Inspect the on-device database directly — the most reliable check that a write
actually landed:

```bash
sqlite3 "$(find "$(xcrun simctl get_app_container booted host.exp.Exponent data)/Documents" -name budget.db | head -1)" "SELECT COUNT(*) FROM transactions;"
```

Expo Go shows a "developer menu" sheet over the app on most cold starts and it
cannot be dismissed without tapping. Screenshots taken this way have the bottom
half covered; use `/reload` instead of a cold start where possible.

`.shots/` is gitignored scratch space for these screenshots.

## Conventions

Comments explain *why*, not what — match the existing density, which is low but
present at every non-obvious decision. Screens stay presentational; put logic in
`src/queries/`. Don't commit or push unless asked.
