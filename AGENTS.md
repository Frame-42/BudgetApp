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
| `src/import/` | Bank-export reading: `csv.ts`, `rules.ts` (MCC + merchant names), `plan.ts` |
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

**Spend and Trends sit outside the snapshot.** Both take query arguments — a
period, a search term and a set of categories for Spend; a set of categories for
Trends — which the provider's argument-free "recompute everything" shape cannot
express. They own `src/state/useTransactionFeed.ts` and `src/state/useTrendsView.ts`,
each with its own debounced database subscription and a generation guard so a
slow wide query cannot land after the narrow one that replaced it. Deliberate;
don't tidy them back into the provider.

**The two screens share one filter.** A Trends scope — the picked month or the
span, plus the selected categories — is handed to Spend by `feed.focus()` from
`App.tsx`, which is the whole of the navigation. So Spend's period is a
`{month|range|all}` union and `TransactionFilter` is a plain `from`/`to` window:
a month is just a range, and the query layer no longer knows what a month is.

**Trends narrows its figures, never its donut.** The category predicate goes
inside the aggregate sums rather than into a `WHERE`, because a month's
`present` flag means *nothing was recorded*, not *nothing in these categories* —
filter the count and empty months turn grey and unpickable. The split query
stays unfiltered too, or selecting a category would redraw the ring as 100% of
itself with no way to add a second; selection is drawn by dimming instead.

**Spend scrolls itself.** A `SectionList` cannot nest in `App.tsx`'s shared
`ScrollView`, so `SCROLLS[tab]` hands Spend the insets and gets out of the way.

**The importer decides nothing twice.** `transactions.external_id` (migration v2)
holds the bank's own id, and a row whose id is already present is skipped
silently — that is what makes re-importing an overlapping export safe. It is
indexed but *not* UNIQUE on purpose: a constraint would abort the batch where the
planner wants to look ahead and report "already imported". Rows typed by hand
have no id, so they get a fuzzy check instead (same cents, ±3 days, same merchant
key) which only ever *flags* — a file can legitimately hold two runs to the same
shop on one afternoon, so dropping a match automatically would lose real spending. `skip` and
`decided` are separate fields for the same reason: a flagged duplicate starts
skipped, so "decided" cannot be inferred from it.

**Merchant memory outranks the MCC table.** `src/import/rules.ts` resolves in the
order: securities purchase → what the user has previously chosen for that
merchant → MCC → review. A code is a guess about a business; the memory is a
decision the user already made, and it is derived by counting existing
transactions rather than stored, so ordinary manual entry teaches it too.

**Nothing is auto-filed as 'Other', and no MCC appears in two groups.** An
unmapped code goes to review, where one answer teaches the memory for good;
filing it as Other would look like a decision while being the absence of one. The
groups in `MCC_CATEGORIES` are flattened into a Map, so a code listed twice lets
the last group silently win — 5813 was in both Dining and Leisure once already.
**Colour is reserved for status.** The palette is white-at-an-alpha over
graphite, plus the two accent tints in `theme.ts` for on-track status and income.
Introducing a new hue is a design decision, not a styling one.

## Verifying changes on this machine

`xcode-select` is set (`/var/db/xcode_select_link` → Xcode, since 2026-08-28), so
the live simulator panel (`mcp__Claude_Code_iOS_Simulator__control`) **works**,
touch injection included. An earlier note here said it was blocked; that is no
longer true.

Two things about the panel that cost time on 2026-09-02:

- Its `screenshot` action fails intermittently with "restarting after a crash".
  Don't retry it in a loop — `xcrun simctl io booted screenshot` never fails and
  is the better default anyway.
- `tap`/`swipe` coordinates are **device points** (402×874 on the iPhone 17 Pro),
  while a `simctl` screenshot is 3× that (1206×2622). Divide screenshot pixels by
  3 before tapping, or every tap lands somewhere else. A tap on the wrong spot
  inside the scrolling column reads as a drag and scrolls the page instead.

**`/reload` is unreliable, and Fast Refresh is not a substitute.** A source edit
triggers Fast Refresh, which *preserves module state* — including the memoized
`getDb()` handle. Anything that touches the database on disk (deleting `budget.db`
to force a first run, checking that `seedIfEmpty` reran) needs a real cold start, or
the app keeps using its already-open connection and nothing appears to change:

```bash
xcrun simctl terminate booted host.exp.Exponent
xcrun simctl openurl booted "exp://127.0.0.1:8081"   # host is in the /reload response
```

A `/reload` can also land Expo Go in a broken runtime — "Cannot find native module
'ExpoAsset'" on a red screen, with no dependency having changed. The cold start
above clears it; don't go hunting for it in the diff.

```bash
# screenshot the booted simulator
xcrun simctl io booted screenshot /Users/frame/Projects/BudgetApp/.shots/shot.png

# force a JS reload without a cold start (keeps Expo Go's dev-menu sheet away)
curl -X POST http://localhost:8081/reload

# cold start on a new bundle
xcrun simctl terminate booted host.exp.Exponent
xcrun simctl openurl booted "exp://127.0.0.1:8081"
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
