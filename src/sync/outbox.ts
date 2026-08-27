import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncedTable } from '../db/migrations';
import type { Change } from './types';

type OutboxRow = {
  seq: number;
  table_name: SyncedTable;
  row_id: string;
  op: 'upsert' | 'delete';
  queued_at: number;
};

/**
 * Pending changes, oldest first, collapsed to one entry per row — a row edited
 * five times offline should cost one push, not five.
 */
export async function pendingChanges(db: SQLiteDatabase, limit = 500): Promise<Change[]> {
  // SQLite resolves the bare `op` column against the row that produced MAX(seq),
  // so each group reports its most recent operation rather than an arbitrary one.
  const rows = await db.getAllAsync<OutboxRow>(
    `SELECT MAX(seq) AS seq, table_name, row_id, op, MAX(queued_at) AS queued_at
       FROM outbox
      GROUP BY table_name, row_id
      ORDER BY seq
      LIMIT ?`,
    [limit],
  );

  const changes: Change[] = [];
  for (const row of rows) {
    const change: Change = {
      table: row.table_name,
      rowId: row.row_id,
      op: row.op,
      updatedAt: row.queued_at,
    };
    if (row.op === 'upsert') {
      const full = await db.getFirstAsync<Record<string, unknown>>(
        `SELECT * FROM ${row.table_name} WHERE id = ?`,
        [row.row_id],
      );
      if (!full) continue; // hard-deleted since it was queued
      change.row = full;
    }
    changes.push(change);
  }
  return changes;
}

/** Drops entries the server confirmed. Anything queued since is left alone. */
export async function acknowledge(db: SQLiteDatabase, upToSeq: number): Promise<void> {
  await db.runAsync('DELETE FROM outbox WHERE seq <= ?', [upToSeq]);
}

export async function pendingCount(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
  return row?.n ?? 0;
}
