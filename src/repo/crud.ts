import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncedTable } from '../db/migrations';
import { newId, now } from '../db/ids';

/**
 * The three writes every table needs. Repositories build on these so that the
 * sync columns are stamped in exactly one place.
 */

export async function insertRow(
  db: SQLiteDatabase,
  table: SyncedTable,
  values: Record<string, unknown>,
): Promise<string> {
  const row: Record<string, unknown> = {
    id: newId(),
    updated_at: now(),
    deleted_at: null,
    owner_id: null,
    ...values,
  };
  const columns = Object.keys(row);
  await db.runAsync(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((c) => row[c] as never),
  );
  return row.id as string;
}

export async function updateRow(
  db: SQLiteDatabase,
  table: SyncedTable,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(patch);
  if (columns.length === 0) return;
  await db.runAsync(
    `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    [...columns.map((c) => patch[c] as never), now(), id],
  );
}

/**
 * Rows are never removed: a delete has to be a fact the server can learn about,
 * which an absent row can't express.
 */
export async function softDeleteRow(
  db: SQLiteDatabase,
  table: SyncedTable,
  id: string,
): Promise<void> {
  const stamp = now();
  await db.runAsync(`UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ?`, [
    stamp,
    stamp,
    id,
  ]);
}

/** Live rows only — every read in the app goes through this filter. */
export function listAlive<T>(
  db: SQLiteDatabase,
  table: SyncedTable,
  { where = '', params = [], orderBy = '' }: { where?: string; params?: unknown[]; orderBy?: string } = {},
): Promise<T[]> {
  const clause = where ? `AND ${where}` : '';
  return db.getAllAsync<T>(
    `SELECT * FROM ${table} WHERE deleted_at IS NULL ${clause} ${orderBy ? `ORDER BY ${orderBy}` : ''}`,
    params as never[],
  );
}
