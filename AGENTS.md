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
npx expo start --ios     # Expo Go — the fast loop, still works
npm run ios              # expo run:ios — compiles and installs the dev build
npm test                 # focused pure-function tests via jest-expo
npx tsc --noEmit         # typecheck; keep it clean
```

There is no linter configured. Keep query and geometry helpers pure so they can
be covered without a simulator.

## Native builds are possible now; Expo Go is still the fast loop

An earlier note here said this machine had **no CocoaPods and no dev-client
build**. That is no longer true — CocoaPods 1.17 is installed, `app.json` carries
a bundle identifier and an Android package, `expo-build-properties` pins the iOS
deployment target to 16.4, and `npm run ios` is `expo run:ios`. So a package
needing a custom native module is no longer fatal.

It is still not free. Every dependency currently in `package.json` ships inside
Expo Go, which is what keeps `npx expo start` working as a no-build loop; the
first package that doesn't ship there costs everyone a native build on every
clone. Weigh that before adding one, and prefer `npx expo install` over
`npm install` so versions match the SDK.

`ios/` and `android/` are gitignored prebuild output. Never hand-edit inside
them — change `app.json` and let the next prebuild regenerate.

## Layout

| Path | Holds |
|---|---|
| `src/theme.ts` | Design tokens — surfaces, the two accent tints, radii, fonts |
| `src/components/` | `primitives.tsx` (Card, HeroCard, T, Amount, Background…), `Charts.tsx`, `TabBar.tsx`, `Icons.tsx`, `BudgetAmountCard.tsx` + `CategoryLimits.tsx` (shared by onboarding and the budget editor), `SegmentedPill.tsx` (the two-state slide switch), `DateCard.tsx` + `SplitCard.tsx` + `RepeatCard.tsx` (Add's advanced options, in that order; the split card is also the edit sheet's), `DayPickerSheet.tsx` (the date card's calendar), `MonthStepper.tsx` (the carets + swipeable month label + tap-for-choices pill, shared by Spend and the day picker), `MonthPickerSheet.tsx` (its `MonthGrid` also shows inside the day picker) |
| `src/screens/` | One per tab, plus `OnboardingScreen` and `BudgetScreen` (a full-screen Modal editor); presentational, fed by props |
| `src/db/` | `client.ts`, `migrations.ts`, `seed.ts`, `demo.ts`, `onboarding.ts`, `types.ts`, `ids.ts` |
| `src/repo/` | Typed CRUD per table — the only place writes happen |
| `src/queries/` | Derived figures per screen; pure, rows in / numbers out |
| `src/import/` | Bank-export reading: `csv.ts`, `rules.ts` (MCC + merchant names), `plan.ts` |
| `src/export/` | CSV writing: `csv.ts` (the serializer), `share.ts` (file + share sheet) |
| `src/state/BudgetProvider.tsx` | Opens the DB, recomputes on every change |
| `src/devtools/` | `DevToolsContext.tsx` (the runtime on/off flag), `DevToolsPanel.tsx` (the dev-only actions card) |
| `src/sync/` | The `SyncEngine` interface and its no-op default |
| `src/format.ts`, `src/time.ts` | Money and date formatting |

## Rules that are easy to get wrong

**The first run is gated, and the seed is not demo data.** `seedIfEmpty` plants
only the seven categories and one Checking account — the account is what makes its
`COUNT(*) FROM accounts` guard work, so never reduce it to categories alone.
Everything else comes from onboarding (`src/db/onboarding.ts`), which writes name,
employment, the monthly budget, a limit per kept category and the weekly-recap
preference in one transaction. It ports the `Onboarding Phone.dc.html` canvas —
a welcome plus four steps; the per-category limits in step 4 are ours, not the
canvas's, and a category left blank there gets no budget row at all, which is not
the same as a row of zero. The canvas never asks for a balance, so Checking keeps
its opening figure of zero. The gate is `sync_meta.onboarded_at`
— local-only and never synced, so `resetDatabase()` clears it and a second device
onboards again. `src/db/demo.ts` holds the months of history the charts need; it is
reachable only from `src/devtools/DevToolsPanel.tsx`.

**There is one app, not two builds, for "with tools" vs "finished product."**
`src/devtools/DevToolsContext.tsx` holds a runtime `enabled` flag, seeded from
`__DEV__` and flippable from a "Developer mode" row that only exists when
`__DEV__` is true — so a real production bundle never grows the row or the flag,
zero extra work. While developing, toggling that row off in the You screen hides
`DevToolsPanel` (Reset to first run / Load sample data) and makes the running app
look exactly like the shipped product, with no rebuild; toggling it back on
restores the tools. New dev-only actions belong in `DevToolsPanel.tsx`'s `tools`
array, not as another ad-hoc `__DEV__` check in a screen.

**A budget edit writes the current month, never a past one.** `monthlyBudgetCents`
and `effectiveLimits` both resolve with `month <= ? ORDER BY month DESC`, so one
month's rows cover every month after it and `db/budget.ts` only ever upserts
`monthKey(Date.now())` — the same rule `db/onboarding.ts` follows. Back-dating
instead would hand the Trends bars a budget those months never had. A month
picker here is not a small feature; it is a decision to let the app rewrite its
own history.

**"This month only" is a pin on the month *after*, not a scope on this one.**
`BudgetInput.scope` picks between the two: `recurring` is the plain write above,
and `month` adds a row on `monthKey(addMonths(now, 1))` holding the figure that
was already in force there, which is what stops this month's rows carrying
further. Three things make it hold together:

- The pin is read against **next month**, before anything is written — not
  against last month. A recurring save made an hour ago is already the standing
  budget, and reading backwards would revert past it. An existing pin answers
  for itself.
- Both scopes call `clearFutureBudgets` first, so a pin from an earlier one-off
  can't outlive the edit that replaced it — otherwise a later *recurring* save
  would take effect this month and be silently undone the next.
- A pin is written only where the figure actually moved, and a category absent
  from the pin is written as an explicit `0` (the same rule as a cleared limit).
  Pinning what carrying forward already says grows the table for nothing.

Anything found at `month > monthKey(now)` is by construction a pin: nothing else
in the app writes ahead of the current month.

**A cleared category limit is written as an explicit zero.** Because limits carry
forward, writing *nothing* for a blanked field leaves an earlier month's row
still applying — the edit would silently not take. So `saveMonthBudget` reads
`effectiveLimits` first and writes a 0 row for this month wherever a limit was in
force and the field is now empty. A 0 row is a real state, not a missing one:
`queries/home.ts` gates on `limitCents > 0`, so it renders exactly as a category
that never had a limit. Categories with nothing to override are skipped, which is
what stops the table growing a zero row per category per month. Onboarding is the
opposite case and keeps its own rule — there is nothing to override on a first
run, so a blank there writes no row at all.

**The budget editor and onboarding are the same two controls.**
`src/components/BudgetAmountCard.tsx` (the rail plus its typed escape) and
`src/components/CategoryLimits.tsx` (left-to-assign, split evenly, a field per
category) are shared by `OnboardingScreen` steps 2 and 4 and by `BudgetScreen`.
Change the budget UI in one of them and both move. `BudgetAmountCard` pushes its
typed value on every keystroke rather than on a commit, which is what lets both
callers drop it from their navigation — there is never an uncommitted value to
lose, and `typing` resets by unmounting since both render it conditionally.

**The budget list orders by `sort_order`, not `add.categories`.** `loadAddOptions`
ranks by recent use, which is right for the Add screen's chips and wrong for a
list of limits that should sit where Home puts them and stay put between visits.
`loadYou` carries its own `categories` in `sort_order` for exactly this.

**You's setting rows are keyed, not matched by label.** `queries/you.ts` gives
each row a `key` (`'budget' | 'categories' | 'recap' | 'appearance'`) and
`YouScreen`'s `editors` map attaches the sheet to that. Renaming a row's copy is
then a copy change; matching on the string 'Monthly budget' would make it a
silently dead tap target.

**Deselecting a category archives it.** `archiveCategory`, never a delete —
`listCategories` filters `archived = 0` so it leaves the chips, while `queries/trends.ts`
joins without that filter so old spending keeps its label.

**A split transaction is N real rows, not a spread computed at read time.**
`src/db/split.ts` turns one transaction into one ordinary transaction row per
month, sharing a `split_id` (migration v3). Deriving it on the way out instead
would mean teaching Home, Trends, Spend, the donut, the weekly bars and the CSV
export what a split is; materialising it means none of them ever find out — a
part is simply spending in its own month. Six rules hold it together:

- **The sheet edits the whole transaction, not the part that was held.** The
  amount it seeds is `split.totalCents`, and the month count is the reach. The
  head still shows the part, because that is the row the user tapped.
- **A delete takes the group.** Leaving eleven twelfths of a purchase behind
  because the sheet was opened on December is a trap, not a feature.
- **The parts always sum back to the figure that was typed.** `splitAmounts`
  hands the remainder to the earliest parts (1000 over 3 is 3.34 + 3.33 + 3.33),
  so no cent is ever lost to rounding. The preview in the sheet calls the same
  function, so the figure shown is the figure written.
- **Later parts keep the day of the month, clamped.** `addMonthsKeepingDay`, not
  `addMonths` — which lands on the 1st, right for a budget month and wrong here.
  Every part is measured from the anchor rather than from its predecessor, so
  31 Jan spread over 12 gives 12 distinct months with no drift, and 28 Feb does
  not pull March back to the 28th.
- **Changing the count reuses rows in place.** 12 months down to 6 rewrites six
  and soft-deletes six; it does not delete twelve and mint twelve fresh ids
  through the outbox. Only the surplus is retired, only the shortfall created.
- **`external_id` is never copied onto a new part.** The bank's id identifies one
  line on one statement; on twelve rows it would make a re-import skip real
  spending. Only the row that was actually imported keeps it, which it does by
  being the one reused.

The count and the total are aggregated in `queries/transactions.ts` rather than
stored, so they cannot drift from the rows; `split_index` *is* stored, because a
part's position is a fact about the row. A group that has shrunk to one row is
reported as no split at all — it reads and edits as an ordinary transaction, and
the stale id is dropped on the next save.

Two consequences worth knowing before changing this. The money leaves the month
it actually left the account, which is the point but is also why account
balances still come out right: `balancesByAccount` sums every part whatever its
date, and the parts sum to the original. And the CSV export writes the parts as
twelve independent rows, so a file that leaves and comes back is twelve
transactions rather than one split — the money round-trips, the grouping does
not. Fixing that means a new column, which `export/csv.ts` says is exactly what
turns the export from a backup into a report; leave it.

**A recurring expense is a schedule that books its own occurrences.** Add's
"Advanced" pill reveals a Date card, the split stepper and a Repeats card; picking a cadence
makes the expense occurrence 0 of a `recurring` row (migration v4 added
`cadence`, `anchor_at`, `split_months`, and `transactions.recurring_id`). Six
rules:

- **Occurrences are materialised, like split parts, but only once due.** A
  schedule has no end, so nothing is written ahead of time; `next_due_at` is
  the only trace of the next one, which is what Home's "Next out" reads.
- **It rolls forward on its own.** `bookDueRecurring` runs before the
  provider's first load and on every return to the foreground, and books every
  missed occurrence on its own date. No "mark as paid": a standing order leaves
  the account whether or not the app is opened. A module-level lock stops the
  two triggers booking one occurrence twice.
- **Every occurrence is measured from the anchor**, never from the previous one
  (`occurrenceAt` in `time.ts`), so 31 Jan monthly gives 28 Feb and then 31 Mar.
  Only the anchor and the next due date are stored; the count between them is
  derived by `occurrenceIndex`. Pre-v4 rows have no anchor — `next_due_at`
  stands in and is written back on the first advance.
- **Each occurrence is spread by `split_months`** through `insertSplit`, and
  every part carries the `recurring_id`.
- **Edit and Delete act on one occurrence; "Stop repeating" ends the schedule.**
  Stopping soft-deletes the `recurring` row and leaves every booked occurrence —
  that money moved. A stopped schedule reads as `recurring: null` on the item.
- **Closing "Advanced" resets every option**, the date included. An option
  still applying while hidden would be written into the next expense unasked.
  The section reopens by itself when the screen remounts onto options already set.
- **The date is a day, not a moment, and `null` is today.** A back-dated entry
  is stamped with the picked day at the current time of day (`onDay`), so it
  sorts sensibly within that day; nothing after today is pickable. The split and
  the repeat are measured from it, and a back-dated schedule books its missed
  occurrences straight after `startRecurring` rather than waiting for the next
  foreground.

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

**Trends loads one current snapshot.** `loadTrends` builds the 3M, 6M and 1Y
views plus their adjacent period previews from one bounded set of source rows,
and the screen switches between those precomputed spans locally. `endOffset`
is the displayed period's final month relative to today (never positive).
Swiping pages by the selected span; historical months are completed months,
not an artificial "current" month. The displayed `from`/`to` window also drives
the Spend hand-off. The bars, pace and split reads run through one
`withExclusiveTransactionAsync` transaction handle so they all describe one WAL
snapshot on native; web uses `withTransactionAsync` because Expo does not support
the exclusive API there. Don't move those statements back to independent calls.

**Spend scrolls itself.** A `SectionList` cannot nest in `App.tsx`'s shared
`ScrollView`, so `SCROLLS[tab]` hands Spend the insets and gets out of the way.
Its month stepper and picker stop at the current month even when a split purchase
has materialised future rows; those rows still count in balances, but a future
Spend page is not a valid browsing period.

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

**Review asks per merchant, not per row.** `reviewGroups` in `src/import/plan.ts`
collapses the uncategorised rows by `merchantKey`, so eleven Amazon charges are
one question and the answer patches all eleven — a month of card spending is
mostly a handful of shops repeated, and asking per row is what makes people
abandon the file. Two rows stay ungrouped on purpose: a flagged duplicate (that
question is "is this the same purchase I already typed in?", which is about the
one row), and a row whose key came out empty (nothing in the descriptor was
matchable, so grouping would file unrelated nameless rows under one answer).
`needsReview` still counts rows and is what the "to check" stat shows; the
"Check N" button counts questions, because that is the promise about how much
work is ahead.

**The export is the importer's format, and that is load-bearing.** `src/export/csv.ts`
writes exactly the columns `src/import/plan.ts` reads — `datetime, amount, name,
category, note, transaction_id` — so a file that leaves round-trips into the same
transactions. Two importer rules exist only to close that loop: a `category`
column naming a category the app has is honoured, and an explicit `note` column
beats the one derived from `original_amount`. Adding a column the importer
ignores makes the export a report rather than a backup; don't.

`transaction_id` is `external_id ?? id`, so hand-entered rows carry the app's own
row id rather than leaving the importer's required column blank — which is what
makes re-importing an export idempotent. `datetime` is local ISO with the offset
(`time.ts`'s `isoLocal`), never `toISOString()`: a 00:30 purchase in Zurich has a
UTC date of the day before, and off-by-one dates in a budget app are worse than
no export. Amounts are decimal euros in the file and cents everywhere else.

**Merchant memory outranks the MCC table.** A row whose type is
`BENEFITS_SAVEBACK` is excluded first: the investment contribution is not
spending. `src/import/rules.ts` resolves every other row in the order: securities
purchase → what the user has previously chosen for that merchant → a `category`
column naming a category we have → MCC → review. The
category column sits *below* the memory deliberately: in a bank's file that
column is the bank's guess, and a guess must not outrank a decision the user
made. On a restore into an empty app the memory is empty, so it still wins there. A code is a guess about a business; the memory is a
decision the user already made, and it is derived by counting existing
transactions rather than stored, so ordinary manual entry teaches it too.

**Nothing is auto-filed as 'Other', and no MCC appears in two groups.** An
unmapped code goes to review, where one answer teaches the memory for good;
filing it as Other would look like a decision while being the absence of one. The
groups in `MCC_CATEGORIES` are flattened into a Map, so a code listed twice lets
the last group silently win — 5813 was in both Dining and Leisure once already.
**A field's whole surface is its touch target, not the text in it.** A bare
`TextInput` answers taps across its own box only — one line of text tall, inside
whatever padding the container carries — so the 54pt name pill in onboarding took
taps on a band through its middle and ignored the rest, and the "For" card on Add
ignored its label and its padding entirely. `FieldSurface` in `primitives.tsx` is
the fix and the convention: use it in place of the `View` or `Card` around a
field, and it forwards taps to the `TextField` under it (found through context,
so no call site threads a ref). It wears a Card look via `cardStyle(quiet)`,
which `Card` itself now uses so the two cannot drift. Taps landing on the input
still reach the input, so tapping mid-word to place the cursor is unaffected.

The one field deliberately left bare is `BudgetAmountCard`'s typing row: it is
`autoFocus`ed on entry and its `onBlur` is what closes typing again, so a tap
just outside the digits is *meant* to dismiss rather than refocus. Its 50pt
figure is already a large target, and the non-typing state has its own Pressable.

**Colour is reserved for status.** The palette is white-at-an-alpha over
graphite, plus the two accent tints in `theme.ts` for on-track status and income.
Introducing a new hue is a design decision, not a styling one.

## Verifying changes on this machine

`xcode-select` is set (`/var/db/xcode_select_link` → Xcode, since 2026-08-28), so
the live simulator panel (`mcp__Claude_Code_iOS_Simulator__control`) **works**,
touch injection included. An earlier note here said it was blocked; that is no
longer true.

**Touch injection binds to one simulator instance, at the first attach of the
session. Boot the simulator before you attach, and never reboot it after.**

Chased to the bottom on 2026-09-07. The symptom is every `tap`/`swipe` failing
with `SimDeviceLegacyHIDClient` / "No Legacy HID port found" while `attach` and
screenshots keep working — and the maddening part, that it works in some sessions
and not others.

The cause is a stale device handle in the tool, not anything about the Mac. The
proof: with *only* the iOS 26.5 iPhone booted, `attach` cheerfully reported it was
attached to the **26.4** iPhone, which was shut down at the time. It had latched
onto that device instance at the session's first attach and never let go. Taps
then go to a device that isn't running, and "no HID port" is the honest answer.

Two consequences worth knowing:

- **Rebooting does not heal it.** Boot the very device the tool named, confirm
  `xcrun simctl io booted enumerate | grep LegacyHID` shows the port `On`, and
  taps still fail. The handle is bound to the *instance*, so the fix is a new
  Claude Code session — not a new simulator.
- **The device list goes stale too.** Passing the UDID of a freshly booted device
  the tool didn't already know returns "No simulator with UDID …".

So the working order is: boot the simulator, let it settle, `attach`, and then
leave it alone. A single `simctl shutdown` or `simctl boot` mid-session costs you
touch injection until you start a new session.

Ruled out, so nobody re-runs these: which process booted the device (Simulator.app
vs `simctl boot` — tested both, clean, in every order), the runtime version (26.4
and 26.5 behave identically), whether Simulator.app is running, whether it is
focused, and whether `attach` was called before the first tap. None of them
matter, and Xcode 26.6 still ships `SimDeviceLegacyHIDClient`, so nothing has been
removed.

`xcrun simctl io booted screenshot` never goes through that handle and so never
breaks — it stays the reliable check. To reach a screen you cannot tap your way
to, temporarily change the initial state (`App.tsx`'s `tab`, an `if (true || …)`
on the onboarding gate, `OnboardingScreen`'s `step`), shoot it, and revert. Don't
delete the simulator's `budget.db` to force a first run — that is the developer's
own data.

Note that two devices are called "iPhone 17 Pro", one per runtime. Always identify
a simulator by UDID, never by name.

Two things about the panel that cost time on 2026-09-02:

- Its `screenshot` action fails intermittently with "restarting after a crash".
  Don't retry it in a loop — `xcrun simctl io booted screenshot` never fails and
  is the better default anyway.
- `tap`/`swipe` coordinates are **device points** (402×874 on the iPhone 17 Pro),
  while a `simctl` screenshot is 3× that (1206×2622). Divide screenshot pixels by
  3 before tapping, or every tap lands somewhere else. A tap on the wrong spot
  inside the scrolling column reads as a drag and scrolls the page instead.

**The panel is not a separate, hidden simulator — it drives the same
Simulator.app window the user already has open.** `attach`/`tap`/`swipe` send
real input to the one booted CoreSimulator device; there is only ever one
device, and Apple's own `Simulator.app` is just a viewer bound to it like the
tool is. That is why every tap during this session landed live in the user's
own visible Simulator.app window — not a second one, not a screenshot loop.
Worth being explicit about, because the failure below is very easy to
misdiagnose as "the shared device is somehow broken" when it isn't: confirmed
by `ps` mid-outage, `Simulator.app` (pid 72266, launched 2026-09-09 17:17, the
same UDID throughout) never stopped running, and the device stayed `Booted`
the whole time. Only the tool's own helper died.

**The whole panel can go down, not just `screenshot` — and that time the tool
won't self-heal.** Chased on 2026-09-11: after a session's worth of `attach` /
`tap` / `swipe` all working fine, every one of them started failing with
_"Claude Code iOS Simulator has stopped retrying after repeated crashes.
Retrying will not help; ask the user to re-open the simulator panel."_ — from a
cold `attach`, and confirmed still true of a bare `tap` too, not just
`attach`/`screenshot`. This is one level below the `SimDeviceLegacyHIDClient`
story above: not a stale handle inside the tool, but its actual helper
*process* — `claude-ios-sim`
(`/Applications/Claude.app/Contents/Helpers/Claude iOS Sim.app`, part of Claude
Desktop, unrelated to Xcode or this project) — dying outright, most likely while
capturing/compositing frames from that same Simulator.app window for the tool's
own preview and `screenshot` action.

Confirmed from the crash reports themselves, at
`~/Library/Logs/DiagnosticReports/claude-ios-sim-*.ips`: thirteen crashes in
under 4 minutes, same `slice_uuid` (`cf3c20f6-256e-338e-8215-a444e0d730dc`)
every time, `EXC_CRASH`/`SIGABRT`, an uncaught Objective-C exception thrown from
deep inside Apple's own CoreImage/Metal stack —
`+[CIKernelLibrary(Internal) internalBinaryArchiveWithName:device:]` →
`-[_MTLBinaryArchive loadFromURL:error:]` → `-[_MTLDevice
recordBinaryArchiveUsage:]`. Thirteen is where it gave up and started
answering every action with the message above instead of trying again. Nothing
in this project's code path is on that stack, and it happened between tool
calls with no `tap`/`attach` in flight, so it wasn't provoked by anything an
agent did — it's a fault in Apple's shader-archive loading on this machine's OS
(`macOS 27.0 (26A5425a)` — an early/beta build; that class of Metal cache bug is
more common there). `ps aux | grep claude-ios-sim` confirmed the process was
gone, not hung.

There is no recovery from inside a session: the tool's own message is the fix —
tell the user to reopen the simulator panel, which relaunches the helper — and
don't burn a retry loop on `attach` once you've seen this message once, since it
means the retry budget is already spent. Don't try relaunching
`claude-ios-sim` from a shell either — tried it: it takes its commands over its
own stdin from whatever spawned it, so run standalone it just logs
`stdin EOF, exiting` and dies with nothing to connect to. Only Claude Desktop
itself, reopening the panel, spawns it wired up to anything. Meanwhile `xcrun simctl` commands keep
working exactly as always (`screenshot`, `launch`, `openurl`, and reading
`budget.db` with `sqlite3`) — they talk to the simulator directly, never through
this helper — so a write can still be verified even with the panel dead; only
live tapping and the panel's own `screenshot` are blocked until it's reopened.

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
