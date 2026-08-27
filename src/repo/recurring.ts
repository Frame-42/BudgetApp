import type { SQLiteDatabase } from 'expo-sqlite';
import type { RecurringRow } from '../db/types';
import { insertRow, listAlive } from './crud';

/** Scheduled money out, e.g. rent — powers the Home screen's "Next out" tile. */
export const listRecurring = (db: SQLiteDatabase) =>
  listAlive<RecurringRow>(db, 'recurring', { orderBy: 'next_due_at' });

export const createRecurring = (
  db: SQLiteDatabase,
  values: {
    label: string;
    amount_cents: number;
    next_due_at: number;
    account_id: string | null;
    category_id: string | null;
  },
) => insertRow(db, 'recurring', values);

export async function nextDue(db: SQLiteDatabase, after: number): Promise<RecurringRow | null> {
  const row = await db.getFirstAsync<RecurringRow>(
    `SELECT * FROM recurring
      WHERE deleted_at IS NULL AND next_due_at >= ?
      ORDER BY next_due_at LIMIT 1`,
    [after],
  );
  return row ?? null;
}
