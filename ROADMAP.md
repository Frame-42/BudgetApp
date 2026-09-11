# ROADMAP

Where BudgetApp stands and what it still needs. Written against the code as of
`feat/you` — five screens, on-device SQLite, onboarding, import, export, an
editable budget, dev tools.

The app is complete as a *demonstration*: every screen draws real figures from
real rows. It is not yet complete as a *product* — the gap is almost entirely
"the user can see it but cannot change it", plus the absence of any safety net
under the data.

---

## Where the seams are

Three facts explain most of what follows:

1. **Almost every write happens once, during onboarding.** `setBudget`,
   `createAccount` and `archiveCategory` are called from `src/db/onboarding.ts`,
   `src/db/seed.ts` and `src/db/demo.ts` — and nowhere else. After the first run
   the only rows a user can create or change are transactions.
2. **There is no account, and no sync.** `src/sync/types.ts` defines the
   interface; `src/sync/local.ts` is a no-op. The outbox fills and is never
   drained.
3. **Test coverage is focused, and there is no lint or CI.** Jest covers the
   highest-risk helpers and recent query work, but most persistence paths still
   rely on `npx tsc --noEmit` and simulator checks.

---

## P0 — the data is not safe

Everything lives in one SQLite file on one device, with no sync and no backup.
There is now an export, so a user who remembers to run it can get their
transactions off the device — but nothing else in the database travels with it,
and nothing runs it for them. A wiped simulator or a lost phone still loses
every setting, budget and category. This outranks every feature below.

- [x] **Export to CSV.** `src/export/csv.ts` writes the importer's own columns
      and `src/export/share.ts` hands the file to the share sheet, from a tile on
      the You screen. It round-trips: two rules were added to `import/plan.ts` (a
      `category` column naming a known category, and an explicit `note` column)
      so a restore lands the same transactions rather than a review queue.
      Transactions only — categories, budgets and settings have no place in the
      bank-export shape, so a full backup is still open.
- [ ] **Wire the SQLite file into iOS backup deliberately** — confirm where
      `budget.db` lands and whether it is included in iCloud/iTunes backup, and
      say so in the README either way. Right now nobody knows.
- [ ] **A user-facing "erase all data"**, not just the `__DEV__`-gated
      `DevToolsPanel` reset. A shipped build currently has no way to start over.
- [ ] **Bound the outbox.** Triggers write to it on every insert/update/delete
      and nothing calls `acknowledge()`, so it grows for the life of the install.
      Either cap it while no engine is registered, or make its size visible.

## P1 — the settings screen is read-only

The budget — overall and per category — and Appearance are now editable.
Categories and Weekly recap are still read-only, captured during onboarding and
unchangeable after. Each row in `loadYou` carries a `key` discriminant and
`YouScreen`'s `editors` map attaches an editor to it, so the remaining two are
a screen each rather than any plumbing.

Note the Categories row still means the category *list* (add, rename, reorder,
archive — below), not its budgets; those live behind Monthly budget.

- [x] **Edit the monthly budget.** Merged into the editor below — the overall
      figure and the per-category limits are one decision, so they are one page.
- [x] **Edit per-category limits.** `src/screens/BudgetScreen.tsx` — onboarding's
      step 2 and step 4 on one page, prefilled, opened from the Monthly budget
      row. Never writes a past month, so those keep the budget they were
      actually kept to. Saving below 100 € is refused: a nil budget makes
      Home read "0% of 0 €".

      The "no row is not a limit of zero" rule survives, inverted: a *cleared*
      field must be written as an explicit zero for this month, because writing
      nothing would leave an earlier month's limit still carrying forward. A zero
      row reads as "no limit" everywhere (`queries/home.ts` gates on
      `limitCents > 0`), and categories with nothing to override are skipped, so
      the table doesn't grow a zero row per category per month.
- [x] **Recurring vs. this month only.** A sliding pill in the editor's floating
      footer (`src/components/SegmentedPill.tsx`) says how far the edit reaches —
      it sits with the CTA because it is part of saving rather than part of the
      figures — and the eyebrow restates the choice, since the difference is
      invisible until the month turns over. `recurring` is the plain write;
      `month` adds a *pin* on the following month holding whatever was already in
      force there, which is what stops this month's rows carrying any further.
      Both scopes clear everything after this month first, so an earlier
      one-off's pins can't outlive the edit that replaced them. See AGENTS.md
      for the three rules that keep it consistent.
- [ ] **Manage categories after onboarding** — add, rename, reorder, and archive
      (`archiveCategory`, never delete — `queries/trends.ts` joins without the
      archived filter so old spending keeps its label).
- [ ] **Weekly recap**: the preference is stored and nothing reads it. Either
      build the recap (see P3) or stop asking for it in onboarding.
- [x] **Appearance**: System (the default), Dark and Light — tapping the row
      steps SYS → DARK → LIGHT. The light palette is pearl, not white.
- [ ] **"Sign out" is a dead `Card`** — not even a `Pressable`. Remove it until
      there are accounts, or make it the entry point to P4.

## P2 — features the schema promises but the UI doesn't deliver

- [ ] **Accounts.** One Checking account is created with
      `opening_balance_cents: 0` and there is no way to add another or to set a
      real opening balance — which makes every derived balance a fiction. Needs
      an accounts list, create/edit, and an opening-balance field. (Balances stay
      *derived*; never store one.)
- [ ] **Recurring.** Create is done — Add's "Advanced" section sets a weekly,
      monthly or yearly cadence (spreadable over months, like any expense) — and
      so is stop, from the Spend sheet of any occurrence. Due dates roll forward
      automatically on launch and foreground (`src/db/recurring.ts`). Still
      open: editing a schedule's amount or category (today an edit changes one
      occurrence, so a raise means stop and re-add), and a list of schedules —
      one whose occurrences were all deleted has no row left to stop it from.
- [ ] **Income entry.** `AddScreen` records expenses only; the sign can be
      flipped just by editing an existing row in `SpendItemSheet`. Add an
      income/expense switch to Add, or state plainly that income arrives only via
      import.
- [ ] **Import beyond CSV.** OFX/QIF, and a column-mapping step for exports whose
      headers aren't recognised — today an unfamiliar bank export simply fails.
- [ ] **Share-sheet import** — pressing Share on an export inside a banking app
      and having BudgetApp appear as a target, instead of saving the file first
      and opening it here through `DocumentPicker`. `src/import/plan.ts` and
      `ImportSheet.tsx` already separate "get the text" from "plan it", so the
      hand-off is only a second way to reach `onPlan(text)`, opened straight to
      `'preview'`. The real cost is native: an iOS Share Extension (its own app
      target, an App Group to hand data to the main app, a paid developer
      account for a real device) plus Android intent filters — most practically
      `expo-share-intent`'s config plugin for both. That is a permanent exit
      from Expo Go for this feature: Expo Go is a fixed binary Expo ships and
      can never contain a third-party native module, no config changes that: it
      would need `npm run ios` / `expo run:android`'s dev-client build to be how
      the app is opened, by anyone testing it, from then on. Left alone for now.
- [ ] **Search and filter reach.** Spend filters by category and text; date-range
      and amount-range filters are the obvious next two.

## P3 — polish and correctness

- [ ] **No error boundary.** A throw anywhere below `BudgetProvider` blanks the
      app. Add one with a "reload" affordance.
- [ ] **No loading or failure state for the database.** `Phone` renders an empty
      `Background` while `data` is null — if `getDb()` rejects, that is the app,
      permanently, with no message.
- [ ] **Silent failures in writes.** `addExpense` returns early when there is no
      default account and tells the user nothing. Five `catch` blocks exist in
      the whole codebase, two of them in `ImportSheet`.
- [ ] **Dynamic Type / font scaling** is untested against the fixed `size` props
      in `primitives.tsx`; the layout is built to design pixel sizes.
- [ ] **Reduced motion** — `LayoutAnimation` in `TabBar` and the sheet
      transitions ignore the accessibility preference.
- [ ] **Weekly recap notifications**, if the setting stays: `expo-notifications`
      ships in Expo Go, so this is buildable inside the hard constraint.

## P4 — sync, for real

The schema was built for this (UUID keys, `updated_at`, soft deletes, the
trigger-fed outbox, a NULL `owner_id` waiting to be claimed). What is missing is
everything above the interface:

- [ ] Pick a backend that works in Expo Go — Supabase's JS client does; anything
      needing a native module (PowerSync, WatermelonDB, op-sqlite) does not.
- [ ] **Auth**, and the single `UPDATE` that claims local rows by setting
      `owner_id` on first sign-in.
- [ ] **An apply-pull path.** `SyncEngine.pull` is typed but nothing writes an
      incoming `Change` into local tables, and last-write-wins with a
      `device_id` tie-break exists only as a comment in `src/sync/types.ts`.
- [ ] Scheduling, retry, and a sync-status surface — the pending count is
      already available from `pendingCount`.

## P5 — engineering hygiene

- [ ] **Broaden tests.** `jest-expo` now covers Trends query construction, donut
      geometry, percentage allocation, month bounds and SAVEBACK planning. CSV
      parsing and the import planner's duplicate rules remain the next targets —
      the two places where a silent bug costs real data.
- [ ] **ESLint + Prettier.** Neither is configured. The codebase is stylistically
      consistent by hand right now; that will not survive a second contributor.
- [ ] **CI.** A GitHub Action running `tsc --noEmit` plus the tests above.
- [ ] **Release config.** `app.json` now carries `com.framefr.budget` as both the
      iOS `bundleIdentifier` and the Android `package`, and `expo-build-properties`
      pins the iOS deployment target to 16.4 — so `expo run:ios` produces a local
      dev build where nothing could be produced before. Still open: there is no
      `eas.json`, so no reproducible release build and no signing story. Also
      decide `supportsTablet: true`, which is currently claimed but never verified
      against a phone-shaped layout.
- [ ] **Android has never been run.** Same claim, same gap.

---

## Explicitly not on this list

These are deliberate decisions recorded in `AGENTS.md`, not omissions: Spend and
Trends owning their own queries outside the provider snapshot; `external_id`
being indexed but not UNIQUE; balances staying derived; nothing being auto-filed
as "Other"; colour being reserved for status.
