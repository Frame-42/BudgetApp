import type { SQLiteDatabase } from 'expo-sqlite';
import type { SettingRow } from '../db/types';
import { listAlive } from './crud';
import { newId, now } from '../db/ids';

export const listSettings = (db: SQLiteDatabase) => listAlive<SettingRow>(db, 'settings');

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ? AND deleted_at IS NULL',
    [key],
  );
  return row?.value ?? null;
}

/** Upsert by key — settings sync as ordinary rows, so they carry sync columns too. */
export const putSetting = (db: SQLiteDatabase, key: string, value: string) =>
  db.runAsync(
    `INSERT INTO settings (id, updated_at, deleted_at, owner_id, key, value)
     VALUES (?, ?, NULL, NULL, ?, ?)
     ON CONFLICT(key) DO UPDATE
       SET value = excluded.value, updated_at = excluded.updated_at, deleted_at = NULL`,
    [newId(), now(), key, value],
  );
