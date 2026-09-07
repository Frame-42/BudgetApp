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
  /** Set only by the importer, from the export's own transaction id. */
  external_id?: string | null;
  /** Set only by `db/split.ts`: the group a spread-over-months part belongs to. */
  split_id?: string | null;
  split_index?: number | null;
};

export const createTransaction = (db: SQLiteDatabase, values: NewTransaction) =>
  insertRow(db, 'transactions', {
    note: null,
    external_id: null,
    split_id: null,
    split_index: null,
    ...values,
  });

export const editTransaction = (
  db: SQLiteDatabase,
  id: string,
  patch: Partial<NewTransaction>,
) => updateRow(db, 'transactions', id, patch);

export const deleteTransaction = (db: SQLiteDatabase, id: string) =>
  softDeleteRow(db, 'transactions', id);

/** One live row, or null once it has been deleted out from under the caller. */
export const getTransaction = async (
  db: SQLiteDatabase,
  id: string,
): Promise<TransactionRow | null> => {
  const rows = await listAlive<TransactionRow>(db, 'transactions', {
    where: 'id = ?',
    params: [id],
  });
  return rows[0] ?? null;
};

/**
 * Every live part of a split, oldest first — the whole transaction as the user
 * entered it. Ordered by date rather than by `split_index` so that a group
 * whose parts arrived from another device out of order still reads in time
 * order; the index breaks ties within a day.
 */
export const listSplitParts = (db: SQLiteDatabase, splitId: string) =>
  listAlive<TransactionRow>(db, 'transactions', {
    where: 'split_id = ?',
    params: [splitId],
    orderBy: 'occurred_at, IFNULL(split_index, 0)',
  });

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
