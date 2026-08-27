import * as SQLite from 'expo-sqlite';
import { migrate } from './migrations';
import { seedIfEmpty } from './seed';
import { newId } from './ids';

const DB_NAME = 'budget.db';

let handle: Promise<SQLite.SQLiteDatabase> | null = null;

/** Opens (once) and returns the app's database, migrated and seeded. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  return (handle ??= open());
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  // Without enableChangeListener the app would never learn about its own writes.
  const db = await SQLite.openDatabaseAsync(DB_NAME, { enableChangeListener: true });
  // WAL keeps reads from blocking the write that triggered them; neither pragma
  // may run inside a transaction, so both happen before the migrations.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(db);
  await ensureDeviceId(db);
  await seedIfEmpty(db);
  return db;
}

export async function getMeta(db: SQLite.SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setMeta(
  db: SQLite.SQLiteDatabase,
  key: string,
  value: string | null,
): Promise<void> {
  await db.runAsync(
    'INSERT INTO sync_meta (key, value) VALUES (?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

/** Identifies this install; sync uses it to break ties between equal timestamps. */
async function ensureDeviceId(db: SQLite.SQLiteDatabase): Promise<void> {
  if (!(await getMeta(db, 'device_id'))) await setMeta(db, 'device_id', newId());
}

/** Development affordance: throw everything away and start from a fresh seed. */
export async function resetDatabase(): Promise<void> {
  const db = await getDb();
  await db.closeAsync();
  await SQLite.deleteDatabaseAsync(DB_NAME);
  handle = null;
  await getDb();
}
