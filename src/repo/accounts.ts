import type { SQLiteDatabase } from 'expo-sqlite';
import type { AccountKind, AccountRow } from '../db/types';
import { insertRow, listAlive, updateRow } from './crud';

export const listAccounts = (db: SQLiteDatabase) =>
  listAlive<AccountRow>(db, 'accounts', { orderBy: 'sort_order' });

export const createAccount = (
  db: SQLiteDatabase,
  values: {
    name: string;
    kind: AccountKind;
    opening_balance_cents: number;
    sort_order: number;
    currency?: string;
  },
) => insertRow(db, 'accounts', { currency: 'EUR', ...values });

export const setOpeningBalance = (db: SQLiteDatabase, id: string, cents: number) =>
  updateRow(db, 'accounts', id, { opening_balance_cents: cents });

/**
 * Balances are derived, never stored: opening balance plus everything that has
 * moved through the account. A stored balance is the hardest field to reconcile
 * between two devices, and it buys nothing you can't compute.
 */
export async function balancesByAccount(db: SQLiteDatabase): Promise<Map<string, number>> {
  const rows = await db.getAllAsync<{ id: string; balance_cents: number }>(
    `SELECT a.id,
            a.opening_balance_cents + IFNULL(SUM(t.amount_cents), 0) AS balance_cents
       FROM accounts a
       LEFT JOIN transactions t
         ON t.account_id = a.id AND t.deleted_at IS NULL
      WHERE a.deleted_at IS NULL
      GROUP BY a.id`,
  );
  return new Map(rows.map((r) => [r.id, r.balance_cents]));
}
