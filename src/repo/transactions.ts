import type { SQLiteDatabase } from 'expo-sqlite';
import type { TransactionRow } from '../db/types';
import { insertRow, listAlive, softDeleteRow, updateRow } from './crud';

export type NewTransaction = {
  account_id: string;
  category_id: string | null;
  merchant: string;
  /** Signed: negative for an expense, positive for income. */
  amount_cents: number;
  occurred_at: number;
  note?: string | null;
};

export const createTransaction = (db: SQLiteDatabase, values: NewTransaction) =>
  insertRow(db, 'transactions', { note: null, ...values });

export const editTransaction = (
  db: SQLiteDatabase,
  id: string,
  patch: Partial<NewTransaction>,
) => updateRow(db, 'transactions', id, patch);

export const deleteTransaction = (db: SQLiteDatabase, id: string) =>
  softDeleteRow(db, 'transactions', id);

/** Half-open range [from, to), newest first. */
export const listTransactions = (db: SQLiteDatabase, from: number, to: number) =>
  listAlive<TransactionRow>(db, 'transactions', {
    where: 'occurred_at >= ? AND occurred_at < ?',
    params: [from, to],
    orderBy: 'occurred_at DESC',
  });

export const countTransactions = async (db: SQLiteDatabase): Promise<number> => {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL',
  );
  return row?.n ?? 0;
};
