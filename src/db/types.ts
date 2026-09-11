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
  /** The bank's id when this row was imported; NULL when it was typed in. */
  external_id: string | null;
  /** Shared by every part of a transaction spread over months; NULL when it isn't. */
  split_id: string | null;
  /** 0-based position within that split, oldest first; NULL outside one. */
  split_index: number | null;
  /** The schedule this row is an occurrence of; NULL when it was entered once. */
  recurring_id: string | null;
};

export type BudgetRow = SyncRow & {
  month: string;
  category_id: string | null;
  limit_cents: number;
};

export type Cadence = 'week' | 'month' | 'year';

export type RecurringRow = SyncRow & {
  label: string;
  /** Signed, like a transaction; the whole occurrence, before any spreading. */
  amount_cents: number;
  next_due_at: number;
  account_id: string | null;
  category_id: string | null;
  cadence: Cadence;
  /** The first occurrence, which every later one is measured from. NULL before V4. */
  anchor_at: number | null;
  /** How many months each occurrence is spread over; 1 is not a split. */
  split_months: number;
};

export type SettingRow = SyncRow & { key: string; value: string };
