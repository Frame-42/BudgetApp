import type { SQLiteDatabase } from 'expo-sqlite';
import type { BudgetRow } from '../db/types';
import { listAlive } from './crud';
import { newId, now } from '../db/ids';

/** Limits for one month. A NULL category_id row is the month's overall budget. */
export const listBudgets = (db: SQLiteDatabase, month: string) =>
  listAlive<BudgetRow>(db, 'budgets', { where: 'month = ?', params: [month] });

export async function monthlyBudgetCents(
  db: SQLiteDatabase,
  month: string,
): Promise<number | null> {
  const row = await db.getFirstAsync<{ limit_cents: number }>(
    `SELECT limit_cents FROM budgets
      WHERE deleted_at IS NULL AND category_id IS NULL AND month <= ?
      ORDER BY month DESC LIMIT 1`,
    [month],
  );
  return row?.limit_cents ?? null;
}

/**
 * Limits carry forward: the most recent month at or before the one asked for
 * wins, so a budget set in March still applies in August without a row per month.
 */
export async function effectiveLimits(
  db: SQLiteDatabase,
  month: string,
): Promise<Map<string, number>> {
  const rows = await db.getAllAsync<{ category_id: string; limit_cents: number }>(
    `SELECT category_id, limit_cents FROM budgets b
      WHERE deleted_at IS NULL AND category_id IS NOT NULL AND month <= ?
        AND month = (SELECT MAX(month) FROM budgets
                      WHERE category_id = b.category_id AND deleted_at IS NULL AND month <= ?)`,
    [month, month],
  );
  return new Map(rows.map((r) => [r.category_id, r.limit_cents]));
}

/**
 * Retires every row after `month`. Only a "this month only" save writes ahead of
 * the current month, so anything found here is one of its pin rows — clearing
 * them first is what lets a later edit of the same month take effect from the
 * month after it, rather than being overridden by a pin left behind.
 *
 * Soft, like every other delete: an absent row can't tell a server anything.
 */
export const clearFutureBudgets = (db: SQLiteDatabase, month: string) => {
  const stamp = now();
  return db.runAsync(
    `UPDATE budgets SET deleted_at = ?, updated_at = ?
      WHERE deleted_at IS NULL AND month > ?`,
    [stamp, stamp, month],
  );
};

/** Upsert of one month/category limit. */
export const setBudget = (
  db: SQLiteDatabase,
  values: { month: string; category_id: string | null; limit_cents: number },
) =>
  db.runAsync(
    `INSERT INTO budgets (id, updated_at, deleted_at, owner_id, month, category_id, limit_cents)
     VALUES (?, ?, NULL, NULL, ?, ?, ?)
     ON CONFLICT(month, IFNULL(category_id, '')) DO UPDATE
       SET limit_cents = excluded.limit_cents, updated_at = excluded.updated_at, deleted_at = NULL`,
    [newId(), now(), values.month, values.category_id, values.limit_cents],
  );
