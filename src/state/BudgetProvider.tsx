import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import { getDb, getMeta, resetDatabase, setMeta } from '../db/client';
import { loadDemoData } from '../db/demo';
import { runOnboarding, type OnboardingInput } from '../db/onboarding';
import { createTransaction, deleteTransaction, editTransaction } from '../repo/transactions';
import { sanitizeMerchant } from '../format';
import { loadHome, type HomeData } from '../queries/home';
import { loadSpend, type SpendData } from '../queries/spend';
import { loadTrends, type TrendsBundle } from '../queries/trends';
import { loadYou, type YouData } from '../queries/you';
import { loadAddOptions, type AddOptions } from '../queries/add';

/** Set once the first run finishes. Local-only, so it never syncs away. */
const ONBOARDED_KEY = 'onboarded_at';

/** Set the first time a Trends bar is tapped, to retire that screen's hint. */
const MONTH_PICKED_KEY = 'trends_month_picked_at';

export type Snapshot = {
  home: HomeData;
  spend: SpendData;
  /** Every span the Trends screen can switch to. */
  trends: TrendsBundle;
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
    const [home, spend, trends, you, add, onboardedAt, pickedAt] = await Promise.all([
      loadHome(db),
      loadSpend(db),
      loadTrends(db),
      loadYou(db),
      loadAddOptions(db),
      getMeta(db, ONBOARDED_KEY),
      getMeta(db, MONTH_PICKED_KEY),
    ]);
    // Resolving the flag alongside the rest keeps `data` null until the gate can
    // be decided, so Home never flashes before onboarding mounts.
    setData({
      home,
      spend,
      trends,
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
