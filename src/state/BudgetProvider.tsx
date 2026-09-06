import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import { getDb, getMeta, resetDatabase, setMeta } from '../db/client';
import { loadDemoData } from '../db/demo';
import { commitImport } from '../db/import';
import { exportTransactionsCsv } from '../db/export';
import { exportFilename } from '../export/csv';
import { shareCsv } from '../export/share';
import { runOnboarding, type OnboardingInput } from '../db/onboarding';
import { createTransaction, deleteTransaction, editTransaction } from '../repo/transactions';
import { saveMonthBudget, type BudgetInput } from '../db/budget';
import { sanitizeMerchant } from '../format';
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
  addExpense: (input: {
    amountCents: number;
    categoryId: string | null;
    merchant: string;
  }) => Promise<void>;
  updateExpense: (input: {
    id: string;
    amountCents: number;
    categoryId: string | null;
    income: boolean;
    merchant: string;
  }) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  completeOnboarding: (input: OnboardingInput) => Promise<void>;
  notePickedMonth: () => Promise<void>;
  reset: () => Promise<void>;
  /** Writes this month's overall budget and every category limit; later months inherit them. */
  saveBudget: (input: BudgetInput) => Promise<void>;
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
    load();
    // One write fires several change events (the row, then its outbox entry),
    // so coalesce them into a single reload.
    const subscription = SQLite.addDatabaseChangeListener(() => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(load, 60);
    });
    return () => {
      if (pending.current) clearTimeout(pending.current);
      subscription.remove();
    };
  }, [load]);

  const addExpense = useCallback<BudgetContextValue['addExpense']>(
    async ({ amountCents, categoryId, merchant }) => {
      if (amountCents <= 0) return;
      const db = await getDb();
      const accountId = (await loadAddOptions(db)).defaultAccountId;
      if (!accountId) return;
      await createTransaction(db, {
        account_id: accountId,
        category_id: categoryId,
        merchant: sanitizeMerchant(merchant),
        amount_cents: -amountCents,
        occurred_at: Date.now(),
      });
    },
    [],
  );

  const updateExpense = useCallback<BudgetContextValue['updateExpense']>(
    async ({ id, amountCents, categoryId, income, merchant }) => {
      if (amountCents <= 0) return;
      const db = await getDb();
      await editTransaction(db, id, {
        // The sheet edits a magnitude; the row's own direction decides the sign.
        amount_cents: income ? amountCents : -amountCents,
        category_id: categoryId,
        merchant: sanitizeMerchant(merchant),
      });
    },
    [],
  );

  /** Soft delete — the update trigger turns it into an outbox 'delete' for sync. */
  const removeExpense = useCallback<BudgetContextValue['removeExpense']>(async (id) => {
    const db = await getDb();
    await deleteTransaction(db, id);
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
   * The current month only — see `db/budget.ts` for why a cleared limit is
   * written as an explicit zero rather than left out.
   *
   * No `load()`: this writes an ordinary table, so the change listener has it.
   */
  const saveBudget = useCallback<BudgetContextValue['saveBudget']>(async (input) => {
    const db = await getDb();
    await saveMonthBudget(db, input);
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
        completeOnboarding,
        notePickedMonth,
        reset,
        saveBudget,
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
