import type { SQLiteDatabase } from 'expo-sqlite';
import { DEFAULT_APPEARANCE } from '../theme';

/**
 * Tables that will eventually sync to an account. They all share the same four
 * columns — id (UUID), updated_at, deleted_at, owner_id — and all of them get
 * outbox triggers.
 */
export const SYNCED_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'budgets',
  'recurring',
  'settings',
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

/** Columns every synced row carries. Kept as a string so the DDL stays readable. */
const SYNC_COLUMNS = `
  id          TEXT PRIMARY KEY NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER,
  owner_id    TEXT`;

/**
 * An append-only change log, fed by triggers rather than by the repositories, so
 * that no write path can bypass it — including ones added long after this file.
 */
const outboxTriggers = (table: SyncedTable) => `
CREATE TRIGGER ${table}_outbox_insert AFTER INSERT ON ${table} BEGIN
  INSERT INTO outbox (table_name, row_id, op, queued_at)
  VALUES ('${table}', NEW.id, 'upsert', NEW.updated_at);
END;

CREATE TRIGGER ${table}_outbox_update AFTER UPDATE ON ${table} BEGIN
  INSERT INTO outbox (table_name, row_id, op, queued_at)
  VALUES ('${table}', NEW.id,
          CASE WHEN NEW.deleted_at IS NULL THEN 'upsert' ELSE 'delete' END,
          NEW.updated_at);
END;

CREATE TRIGGER ${table}_outbox_delete AFTER DELETE ON ${table} BEGIN
  INSERT INTO outbox (table_name, row_id, op, queued_at)
  VALUES ('${table}', OLD.id, 'delete', strftime('%s','now') * 1000);
END;
`;

const V1 = `
CREATE TABLE accounts (
  ${SYNC_COLUMNS},
  name                  TEXT NOT NULL,
  kind                  TEXT NOT NULL,
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'EUR',
  sort_order            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE categories (
  ${SYNC_COLUMNS},
  name        TEXT NOT NULL,
  color_alpha REAL NOT NULL DEFAULT 0.5,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE transactions (
  ${SYNC_COLUMNS},
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  category_id  TEXT REFERENCES categories(id),
  merchant     TEXT NOT NULL,
  -- Signed minor units: negative is money out, positive is money in.
  amount_cents INTEGER NOT NULL,
  occurred_at  INTEGER NOT NULL,
  note         TEXT
);

CREATE INDEX transactions_occurred_at ON transactions (occurred_at DESC);
CREATE INDEX transactions_category    ON transactions (category_id);

CREATE TABLE budgets (
  ${SYNC_COLUMNS},
  -- 'YYYY-MM'. A NULL category_id is the whole month's budget.
  month       TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  limit_cents INTEGER NOT NULL
);

CREATE UNIQUE INDEX budgets_month_category
  ON budgets (month, IFNULL(category_id, ''));

CREATE TABLE recurring (
  ${SYNC_COLUMNS},
  label        TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  next_due_at  INTEGER NOT NULL,
  account_id   TEXT REFERENCES accounts(id),
  category_id  TEXT REFERENCES categories(id)
);

CREATE TABLE settings (
  ${SYNC_COLUMNS},
  key   TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL
);

-- Local only. Never synced, never claimed by an account.
CREATE TABLE outbox (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id     TEXT NOT NULL,
  op         TEXT NOT NULL,
  queued_at  INTEGER NOT NULL
);

CREATE TABLE sync_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
${SYNCED_TABLES.map(outboxTriggers).join('\n')}
`;

/**
 * The bank's own id for an imported row. It is what makes importing the same
 * export twice safe, and the only dedup signal that is exact rather than a
 * guess. NULL on everything entered by hand.
 *
 * Indexed, not UNIQUE: a constraint would abort a batch mid-flight, where what
 * the importer wants is to look ahead and report "already imported".
 */
const V2 = `
ALTER TABLE transactions ADD COLUMN external_id TEXT;
CREATE INDEX transactions_external_id ON transactions (external_id);
`;

/**
 * A transaction spread over several months: an annual insurance premium that
 * belongs to twelve of them rather than to the day it left the account.
 *
 * Each part is an ordinary transaction row — its own date, its own share of the
 * cents — and `split_id` is only what makes the group editable and deletable as
 * one thing again. Materialised rather than derived on the way out so that every
 * query already written keeps working untouched: a part sits in its month for
 * Home, Trends, Spend and the CSV export exactly as a row typed there by hand
 * would. `split_index` is the part's position, which is a fact about the row;
 * the count and the total are aggregates and stay derived.
 *
 * Indexed, not UNIQUE — a split id is shared by every part, which is the point.
 */
const V3 = `
ALTER TABLE transactions ADD COLUMN split_id TEXT;
ALTER TABLE transactions ADD COLUMN split_index INTEGER;
CREATE INDEX transactions_split_id ON transactions (split_id);
`;

/**
 * A recurring row becomes a schedule the Add screen can create, rather than a
 * date the demo sets once.
 *
 * `cadence` is how often it comes round; the default is what the one row V1 ever
 * held (the demo's rent) always meant. `anchor_at` is the first occurrence, and
 * every later one is measured from it rather than from its predecessor, so a
 * schedule started on 31 Jan lands on 28 Feb and then 31 Mar instead of drifting
 * to the 28th for good. NULL on rows from before this step: the code reads
 * `next_due_at` as the anchor there and writes it back on the first advance.
 * `split_months` is how far each occurrence is spread, as `db/split.ts` spreads
 * one transaction.
 *
 * `transactions.recurring_id` is the occurrence's schedule — what lets the Spend
 * sheet offer to stop it. Indexed, not UNIQUE, for the same reason `split_id` is.
 */
const V4 = `
ALTER TABLE recurring ADD COLUMN cadence TEXT NOT NULL DEFAULT 'month';
ALTER TABLE recurring ADD COLUMN anchor_at INTEGER;
ALTER TABLE recurring ADD COLUMN split_months INTEGER NOT NULL DEFAULT 1;
ALTER TABLE transactions ADD COLUMN recurring_id TEXT;
CREATE INDEX transactions_recurring_id ON transactions (recurring_id);
`;

/**
 * Appearance becomes a real choice, and the seed's value becomes the default
 * (`DEFAULT_APPEARANCE`: the phone's scheme, or dark in a dev build). Until now
 * the row was read-only, so every stored 'DARK' is the seed's rather than a
 * decision anyone made — which is what makes resetting it safe. Stamped like any
 * other write, so sync sees a newer row. In a dev build the default *is* dark,
 * so the statement matches nothing.
 */
const V5 = `
UPDATE settings
   SET value = '${DEFAULT_APPEARANCE.toUpperCase()}',
       updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE key = 'appearance' AND value = 'DARK' AND value <> '${DEFAULT_APPEARANCE.toUpperCase()}'
   AND deleted_at IS NULL;
`;

/**
 * Ordered, append-only. To change the schema, add a step — never edit one that
 * has shipped, because devices in the field have already run it.
 */
export const MIGRATIONS: string[] = [V1, V2, V3, V4, V5];

/** Applies whatever hasn't run yet, tracked in PRAGMA user_version. */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
    });
    // PRAGMA can't be parameterised, and version is an array index, not input.
    await db.execAsync(`PRAGMA user_version = ${version + 1}`);
  }
}
