import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import { getDb, resetDatabase } from '../db/client';
import { createTransaction } from '../repo/transactions';
import { loadHome, type HomeData } from '../queries/home';
import { loadSpend, type SpendData } from '../queries/spend';
import { loadTrends, type TrendsData } from '../queries/trends';
import { loadYou, type YouData } from '../queries/you';
import { loadAddOptions, type AddOptions } from '../queries/add';

export type Snapshot = {
  home: HomeData;
  spend: SpendData;
  trends: TrendsData;
  you: YouData;
  add: AddOptions;
};

type BudgetContextValue = {
  data: Snapshot | null;
  addExpense: (input: { amountCents: number; categoryId: string | null }) => Promise<void>;
  reset: () => Promise<void>;
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
    const [home, spend, trends, you, add] = await Promise.all([
      loadHome(db),
      loadSpend(db),
      loadTrends(db),
      loadYou(db),
      loadAddOptions(db),
    ]);
    setData({ home, spend, trends, you, add });
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
    async ({ amountCents, categoryId }) => {
      if (amountCents <= 0) return;
      const db = await getDb();
      const accountId = (await loadAddOptions(db)).defaultAccountId;
      if (!accountId) return;
      await createTransaction(db, {
        account_id: accountId,
        category_id: categoryId,
        // The design's Add screen has no merchant field; this is where one goes.
        merchant: 'Quick entry',
        amount_cents: -amountCents,
        occurred_at: Date.now(),
      });
    },
    [],
  );

  const reset = useCallback(async () => {
    await resetDatabase();
    await load();
  }, [load]);

  return (
    <BudgetContext.Provider value={{ data, addExpense, reset }}>{children}</BudgetContext.Provider>
  );
}

export function useBudget(): BudgetContextValue {
  const value = useContext(BudgetContext);
  if (!value) throw new Error('useBudget must be used inside a BudgetProvider');
  return value;
}
