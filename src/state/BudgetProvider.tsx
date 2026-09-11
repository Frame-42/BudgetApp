import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { getDb, getMeta, resetDatabase, setMeta } from '../db/client';
import { loadDemoData } from '../db/demo';
import { commitImport } from '../db/import';
import { exportTransactionsCsv } from '../db/export';
import { exportFilename } from '../export/csv';
import { shareCsv } from '../export/share';
import { runOnboarding, type OnboardingInput } from '../db/onboarding';
import { deleteRecurring } from '../repo/recurring';
import { putSetting } from '../repo/settings';
import type { Appearance } from '../theme';
import {
  deleteTransactionSplit,
  insertSplit,
  saveTransactionSplit,
  type SplitEdit,
  type SplitTarget,
} from '../db/split';
import { bookDueRecurring, startRecurring } from '../db/recurring';
import type { Cadence } from '../db/types';
import { saveMonthBudget, type BudgetInput } from '../db/budget';
import { sanitizeMerchant } from '../format';
import { onDay } from '../time';
import { loadHome, type HomeData } from '../queries/home';
import { loadYou, type YouData } from '../queries/you';
import { loadAddOptions, type AddOptions } from '../queries/add';
import { buildImportPlan, type ImportPlan } from '../import/plan';

/** Set once the first run finishes. Local-only, so it never syncs away. */
const ONBOARDED_KEY = 'onboarded_at';

/** Set the first time a Trends bar is tapped, to retire that screen's hint. */
const MONTH_PICKED_KEY = 'trends_month_picked_at';

export type Snapshot = {
  home: HomeData;
  you: YouData;
  add: AddOptions;
  onboarded: boolean;
  /** Whether the month bars have ever been used, so the hint can stand down. */
  monthPicked: boolean;
};

type BudgetContextValue = {
  data: Snapshot | null;
  /**
   * The Add screen's submit. `months` spreads it the way the edit sheet does;
   * a `cadence` makes it the first occurrence of a schedule that books the rest
   * as they come due.
   */
  addExpense: (input: {
    amountCents: number;
    categoryId: string | null;
    merchant: string;
    /** The start of the day it happened; null for now. */
    day: number | null;
    months: number;
    cadence: Cadence | null;
  }) => Promise<void>;
  /**
   * The edit sheet's save. It edits the whole transaction, splits included — a
   * held part carries its group, and `months` is how far the amount is spread.
   */
  updateExpense: (input: SplitEdit) => Promise<void>;
  /** Takes the group, not the row: a part is never deleted without its siblings. */
  removeExpense: (target: SplitTarget) => Promise<void>;
  /** Ends a schedule. The occurrences it already booked stay where they are. */
  stopRecurring: (id: string) => Promise<void>;
  completeOnboarding: (input: OnboardingInput) => Promise<void>;
  notePickedMonth: () => Promise<void>;
  reset: () => Promise<void>;
  /**
   * Writes this month's overall budget and every category limit. A `recurring`
   * scope lets later months inherit them; a `month` scope pins the month after
   * back to what it held.
   */
  saveBudget: (input: BudgetInput) => Promise<void>;
  /** Light, dark, or whatever the phone is in. */
  setAppearance: (appearance: Appearance) => Promise<void>;
  /** Reads an export and returns what it would do, without writing anything. */
  planImport: (text: string) => Promise<ImportPlan>;
  /** Writes a plan the user has finished reviewing; resolves with the count. */
  runImport: (plan: ImportPlan) => Promise<number>;
  /**
   * Hands every transaction to the share sheet as a CSV; resolves with how many
   * rows went into it, and with 0 without opening anything when there are none.
   */
  exportCsv: () => Promise<number>;
  /** Development only: throw everything away and land on a populated month. */
  loadSampleData: () => Promise<void>;
};

const BudgetContext = createContext<BudgetContextValue | null>(null);

/**
 * Opens the database once and keeps a snapshot of every screen's figures in
 * memory, recomputed whenever the database changes. At this data volume a full
 * re-query per write is a few milliseconds — cheaper in complexity than any
 * incremental cache, and impossible to get out of step with the rows.
 */
export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    // Spend and Trends are absent on purpose: both take query arguments now — a
    // filtered page, a category selection — so they own their own state in
    // `useTransactionFeed` and `useTrendsView` rather than riding this snapshot.
    const [home, you, add, onboardedAt, pickedAt] = await Promise.all([
      loadHome(db),
      loadYou(db),
      loadAddOptions(db),
      getMeta(db, ONBOARDED_KEY),
      getMeta(db, MONTH_PICKED_KEY),
    ]);
    // Resolving the flag alongside the rest keeps `data` null until the gate can
    // be decided, so Home never flashes before onboarding mounts.
    setData({
      home,
      you,
      add,
      onboarded: onboardedAt !== null,
      monthPicked: pickedAt !== null,
    });
  }, []);

  useEffect(() => {
    /* Booked before the first load, so Home opens on a month that already holds
       the rent that went out while the app was closed. A failure here costs a
       late booking, never the app — the next foreground tries again. */
    const book = () => getDb().then(bookDueRecurring).catch(() => 0);
    book().then(load);
    // No `load()` after the foreground pass: bookings are ordinary transaction
    // writes, which the change listener below already reports.
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') book();
    });
    // One write fires several change events (the row, then its outbox entry),
    // so coalesce them into a single reload.
    const subscription = SQLite.addDatabaseChangeListener(() => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(load, 60);
    });
    return () => {
      if (pending.current) clearTimeout(pending.current);
      subscription.remove();
      foreground.remove();
    };
  }, [load]);

  const addExpense = useCallback<BudgetContextValue['addExpense']>(
    async ({ amountCents, categoryId, merchant, day, months, cadence }) => {
      if (amountCents <= 0) return;
      const db = await getDb();
      const accountId = (await loadAddOptions(db)).defaultAccountId;
      if (!accountId) return;
      const entry = {
        account_id: accountId,
        category_id: categoryId,
        merchant: sanitizeMerchant(merchant),
        amount_cents: -amountCents,
        occurred_at: day === null ? Date.now() : onDay(day),
        months,
      };
      if (cadence) {
        await startRecurring(db, { ...entry, cadence });
        /* Back-dated far enough, its second occurrence is already behind us —
           book it now rather than at the next return to the foreground. */
        if (day !== null) await bookDueRecurring(db);
      } else {
        await db.withTransactionAsync(() => insertSplit(db, entry));
      }
    },
    [],
  );

  /**
   * One write path whether or not months are involved: a plain row spread over
   * one month is just an update, which is what `saveTransactionSplit` does with
   * `months: 1`. It keeps the sign convention — the sheet edits a magnitude and
   * the row's own direction decides the sign.
   */
  const updateExpense = useCallback<BudgetContextValue['updateExpense']>(async (edit) => {
    const db = await getDb();
    await saveTransactionSplit(db, { ...edit, merchant: sanitizeMerchant(edit.merchant) });
  }, []);

  /** Soft delete — the update trigger turns it into an outbox 'delete' for sync. */
  const removeExpense = useCallback<BudgetContextValue['removeExpense']>(async (target) => {
    const db = await getDb();
    await deleteTransactionSplit(db, target);
  }, []);

  const stopRecurring = useCallback<BudgetContextValue['stopRecurring']>(async (id) => {
    const db = await getDb();
    await deleteRecurring(db, id);
  }, []);

  const completeOnboarding = useCallback<BudgetContextValue['completeOnboarding']>(
    async (input) => {
      const db = await getDb();
      await runOnboarding(db, input);
      // Set after the commit, so a crash mid-write leaves the gate closed and the
      // user repeats the flow rather than landing in a half-built app.
      await setMeta(db, ONBOARDED_KEY, String(Date.now()));
      await load();
    },
    [load],
  );

  /** The Trends hint has done its job; remember that across restarts. */
  const notePickedMonth = useCallback(async () => {
    const db = await getDb();
    await setMeta(db, MONTH_PICKED_KEY, String(Date.now()));
    await load();
  }, [load]);

  /**
   * This month, and — for a one-off edit — a pin on the next one that stops it
   * carrying further. See `db/budget.ts` for that, and for why a cleared limit is
   * written as an explicit zero rather than left out.
   *
   * No `load()`: this writes an ordinary table, so the change listener has it.
   */
  const saveBudget = useCallback<BudgetContextValue['saveBudget']>(async (input) => {
    const db = await getDb();
    await saveMonthBudget(db, input);
  }, []);

  /** No `load()`: settings is an ordinary table, so the change listener has it. */
  const setAppearance = useCallback<BudgetContextValue['setAppearance']>(async (appearance) => {
    const db = await getDb();
    await putSetting(db, 'appearance', appearance.toUpperCase());
  }, []);

  const planImport = useCallback(async (text: string) => {
    const db = await getDb();
    return buildImportPlan(db, text);
  }, []);

  /**
   * No explicit `load()` afterwards: this writes only transactions, so the
   * change listener picks it up — unlike the flows that write `sync_meta`,
   * which SQLite's listener does not report.
   */
  const runImport = useCallback(async (plan: ImportPlan) => {
    const db = await getDb();
    const accountId = (await loadAddOptions(db)).defaultAccountId;
    if (!accountId) return 0;
    return commitImport(db, plan, accountId);
  }, []);

  /**
   * The escape hatch: everything the app holds, in the format its own importer
   * reads. Nothing is written to the database, so there is no `load()` here.
   *
   * An empty database returns 0 rather than opening the share sheet on a file
   * with nothing but a header in it; the caller says so instead.
   */
  const exportCsv = useCallback<BudgetContextValue['exportCsv']>(async () => {
    const db = await getDb();
    const { text, count } = await exportTransactionsCsv(db);
    if (count === 0) return 0;
    await shareCsv(text, exportFilename());
    return count;
  }, []);

  /** Resetting first means this never has to reason about existing real data. */
  const loadSampleData = useCallback(async () => {
    await resetDatabase();
    const db = await getDb();
    await loadDemoData(db);
    await setMeta(db, ONBOARDED_KEY, String(Date.now()));
    await load();
  }, [load]);

  const reset = useCallback(async () => {
    await resetDatabase();
    await load();
  }, [load]);

  return (
    <BudgetContext.Provider
      value={{
        data,
        addExpense,
        updateExpense,
        removeExpense,
        stopRecurring,
        completeOnboarding,
        notePickedMonth,
        reset,
        saveBudget,
        setAppearance,
        planImport,
        runImport,
        exportCsv,
        loadSampleData,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
}

export function useBudget(): BudgetContextValue {
  const value = useContext(BudgetContext);
  if (!value) throw new Error('useBudget must be used inside a BudgetProvider');
  return value;
}
