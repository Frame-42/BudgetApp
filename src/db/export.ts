import type { SQLiteDatabase } from 'expo-sqlite';
import { transactionsToCsv, type ExportRow } from '../export/csv';

/**
 * Reads an export. The mirror of `db/import.ts`, and here for the same reason:
 * repos are typed CRUD for one row at a time, and this is one query over the
 * whole table.
 *
 * Joined to categories the way `queries/trends.ts` does — LEFT, and without the
 * `archived` filter — so a category switched off later still names the money
 * that went through it, and a transaction with no category still exports.
 */
export async function loadExportRows(db: SQLiteDatabase): Promise<ExportRow[]> {
  const rows = await db.getAllAsync<{
    id: string;
    external_id: string | null;
    merchant: string;
    amount_cents: number;
    occurred_at: number;
    note: string | null;
    category: string | null;
  }>(
    `SELECT t.id, t.external_id, t.merchant, t.amount_cents, t.occurred_at, t.note,
            c.name AS category
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.deleted_at IS NULL
      ORDER BY t.occurred_at ASC, t.id ASC`,
  );

  return rows.map((row) => ({
    occurredAt: row.occurred_at,
    amountCents: row.amount_cents,
    merchant: row.merchant,
    category: row.category,
    note: row.note,
    transactionId: row.external_id ?? row.id,
  }));
}

/** Everything the app has recorded, as one CSV. Oldest first, like a statement. */
export async function exportTransactionsCsv(
  db: SQLiteDatabase,
): Promise<{ text: string; count: number }> {
  const rows = await loadExportRows(db);
  return { text: transactionsToCsv(rows), count: rows.length };
}
