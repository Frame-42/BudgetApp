# ROADMAP

Where BudgetApp stands and what it still needs. Written against the code as of
`feat/setup` — five screens, on-device SQLite, import, onboarding, dev tools.

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
3. **There is no test, no lint, and no CI.** `npx tsc --noEmit` is the whole of
   the verification story.

---

## P0 — the data is not safe

Everything lives in one SQLite file on one device, with no sync, no export and
no backup. A wiped simulator or a lost phone loses every transaction the user
has typed. This outranks every feature below.

- [ ] **Export to CSV.** The mirror of `src/import/csv.ts`, which already knows
      the shape. Cheapest possible escape hatch and it unblocks the user before
      any backend exists. Share via `expo-sharing` / `expo-file-system`.
- [ ] **Wire the SQLite file into iOS backup deliberately** — confirm where
      `budget.db` lands and whether it is included in iCloud/iTunes backup, and
      say so in the README either way. Right now nobody knows.
- [ ] **A user-facing "erase all data"**, not just the `__DEV__`-gated
      `DevToolsPanel` reset. A shipped build currently has no way to start over.
- [ ] **Bound the outbox.** Triggers write to it on every insert/update/delete
      and nothing calls `acknowledge()`, so it grows for the life of the install.
      Either cap it while no engine is registered, or make its size visible.

## P1 — the settings screen is read-only

`loadYou` renders four rows — Monthly budget, Categories, Weekly recap,
Appearance — and none of them are tappable. All four values were captured during
onboarding and can never be changed again. This is the most obvious "unfinished"
edge a first user will hit.

- [ ] **Edit the monthly budget.** `setBudget(db, {month, category_id: null, …})`
      already exists and limits carry forward by design; this is a sheet, not a
      schema change.
- [ ] **Edit per-category limits.** Same call with a `category_id`. Note the
      existing rule: a category with *no* budget row is not the same as one with
      a limit of zero — the editor has to be able to express both.
- [ ] **Manage categories after onboarding** — add, rename, reorder, and archive
      (`archiveCategory`, never delete — `queries/trends.ts` joins without the
      archived filter so old spending keeps its label).
- [ ] **Weekly recap**: the preference is stored and nothing reads it. Either
      build the recap (see P3) or stop asking for it in onboarding.
- [ ] **Appearance**: the row says `DARK` and only dark exists. Either implement
      a light palette in `src/theme.ts` or drop the row. A half-honest setting is
      worse than none.
- [ ] **"Sign out" is a dead `Card`** — not even a `Pressable`. Remove it until
      there are accounts, or make it the entry point to P4.

## P2 — features the schema promises but the UI doesn't deliver

- [ ] **Accounts.** One Checking account is created with
      `opening_balance_cents: 0` and there is no way to add another or to set a
      real opening balance — which makes every derived balance a fiction. Needs
      an accounts list, create/edit, and an opening-balance field. (Balances stay
      *derived*; never store one.)
- [ ] **Recurring.** The table, `listRecurring`/`nextDue`, and Home's "Next out"
      tile all exist, but only `src/db/demo.ts` ever writes a row. Needs
      create/edit/delete, and a rule for advancing `next_due_at` once a due date
      passes (mark-as-paid, or roll forward automatically).
- [ ] **Income entry.** `AddScreen` records expenses only; the sign can be
      flipped just by editing an existing row in `SpendItemSheet`. Add an
      income/expense switch to Add, or state plainly that income arrives only via
      import.
- [ ] **Import beyond CSV.** OFX/QIF, and a column-mapping step for exports whose
      headers aren't recognised — today an unfamiliar bank export simply fails.
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

- [ ] **Tests.** `src/queries/`, `src/import/`, `src/format.ts` and `src/time.ts`
      are pure and were written to be testable; `jest-expo` was the stated plan.
      Start with the CSV reader and the import planner's duplicate rules — the
      two places where a silent bug costs real data.
- [ ] **ESLint + Prettier.** Neither is configured. The codebase is stylistically
      consistent by hand right now; that will not survive a second contributor.
- [ ] **CI.** A GitHub Action running `tsc --noEmit` plus the tests above.
- [ ] **Release config.** `app.json` has no iOS `bundleIdentifier` and no Android
      `package`, and there is no `eas.json` — so no standalone build can be
      produced today. Also decide `supportsTablet: true`, which is currently
      claimed but never verified against a phone-shaped layout.
- [ ] **Android has never been run.** Same claim, same gap.

---

## Explicitly not on this list

These are deliberate decisions recorded in `AGENTS.md`, not omissions: Spend and
Trends owning their own queries outside the provider snapshot; `external_id`
being indexed but not UNIQUE; balances staying derived; nothing being auto-filed
as "Other"; colour being reserved for status.
