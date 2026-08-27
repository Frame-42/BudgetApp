/** Row shapes as SQLite returns them: snake_case, integers for booleans/dates. */

/** The four columns every syncable table carries. */
export type SyncRow = {
  id: string;
  updated_at: number;
  deleted_at: number | null;
  owner_id: string | null;
};

export type AccountKind = 'checking' | 'savings' | 'credit';

export type AccountRow = SyncRow & {
  name: string;
  kind: AccountKind;
  opening_balance_cents: number;
  currency: string;
  sort_order: number;
};

export type CategoryRow = SyncRow & {
  name: string;
  color_alpha: number;
  sort_order: number;
  archived: number;
};

export type TransactionRow = SyncRow & {
  account_id: string;
  category_id: string | null;
  merchant: string;
  /** Negative is money out, positive is money in. */
  amount_cents: number;
  occurred_at: number;
  note: string | null;
};

export type BudgetRow = SyncRow & {
  month: string;
  category_id: string | null;
  limit_cents: number;
};

export type RecurringRow = SyncRow & {
  label: string;
  amount_cents: number;
  next_due_at: number;
  account_id: string | null;
  category_id: string | null;
};

export type SettingRow = SyncRow & { key: string; value: string };
