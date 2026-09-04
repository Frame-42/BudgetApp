import type { SQLiteDatabase } from 'expo-sqlite';
import { dayLabel, startOfDay } from '../time';

export type TransactionItem = {
  id: string;
  merchant: string;
  category: string;
  /** Preselects the chip when the row is edited; null on income. */
  categoryId: string | null;
  amountCents: number;
  income: boolean;
};

export type TransactionGroup = { key: string; title: string; items: TransactionItem[] };

export type TransactionFilter = {
  /** Half-open window, either end null for unbounded. A month is just a range. */
  from: number | null;
  to: number | null;
  /** Trimmed; '' means no text filter. */
  search: string;
  /** Empty = every category. Ids, so archived categories stay filterable. */
  categoryIds: string[];
};

export type TransactionPage = {
  groups: TransactionGroup[];
  /** Spending figures for the whole filtered set, not just the loaded rows. */
  totalCents: number;
  transactionCount: number;
  averageCents: number;
  /** Every matching row, income included — what the list could scroll to. */
  matchCount: number;
  hasMore: boolean;
};

export const PAGE_SIZE = 60;

export const isFiltered = (f: TransactionFilter): boolean =>
  f.search.trim() !== '' || f.categoryIds.length > 0;

/** `%`, `_` and the escape character itself are literals when a user types them. */
const likeTerm = (search: string) => `%${search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** The one WHERE the row query and the aggregate query share. */
function clauses(filter: TransactionFilter): { where: string; params: unknown[] } {
  const parts = ['t.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filter.from !== null) {
    parts.push('t.occurred_at >= ?');
    params.push(filter.from);
  }
  if (filter.to !== null) {
    parts.push('t.occurred_at < ?');
    params.push(filter.to);
  }

  const search = filter.search.trim();
  if (search) {
    parts.push(`(t.merchant LIKE ? ESCAPE '\\' OR IFNULL(t.note, '') LIKE ? ESCAPE '\\')`);
    const term = likeTerm(search);
    params.push(term, term);
  }

  if (filter.categoryIds.length) {
    parts.push(`t.category_id IN (${filter.categoryIds.map(() => '?').join(', ')})`);
    params.push(...filter.categoryIds);
  }

  return { where: parts.join(' AND '), params };
}

/**
 * The Spend screen's list: the newest `limit` matching rows grouped by day, with
 * the totals computed in SQL over every match so the hero still describes the
 * whole filtered set while only a page of rows is in memory.
 */
export async function loadTransactionPage(
  db: SQLiteDatabase,
  filter: TransactionFilter,
  limit: number = PAGE_SIZE,
  at: number = Date.now(),
): Promise<TransactionPage> {
  const { where, params } = clauses(filter);

  const [rows, totals] = await Promise.all([
    db.getAllAsync<{
      id: string;
      merchant: string;
      amount_cents: number;
      occurred_at: number;
      category_id: string | null;
      category: string | null;
    }>(
      `SELECT t.id, t.merchant, t.amount_cents, t.occurred_at, t.category_id, c.name AS category
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE ${where}
        ORDER BY t.occurred_at DESC
        LIMIT ?`,
      [...params, limit] as never[],
    ),
    db.getFirstAsync<{ matches: number; spent: number | null; spent_count: number }>(
      `SELECT COUNT(*) AS matches,
              SUM(CASE WHEN t.amount_cents < 0 THEN -t.amount_cents END) AS spent,
              SUM(CASE WHEN t.amount_cents < 0 THEN 1 ELSE 0 END) AS spent_count
         FROM transactions t
        WHERE ${where}`,
      params as never[],
    ),
  ]);

  const groups: TransactionGroup[] = [];
  for (const row of rows) {
    const key = String(startOfDay(row.occurred_at));
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, title: dayLabel(row.occurred_at, at), items: [] };
      groups.push(group);
    }
    group.items.push({
      id: row.id,
      merchant: row.merchant,
      category: (row.category ?? (row.amount_cents > 0 ? 'Income' : 'Uncategorised')).toUpperCase(),
      categoryId: row.category_id,
      amountCents: row.amount_cents,
      income: row.amount_cents > 0,
    });
  }

  const matchCount = totals?.matches ?? 0;
  const totalCents = totals?.spent ?? 0;
  const transactionCount = totals?.spent_count ?? 0;

  return {
    groups,
    totalCents,
    transactionCount,
    averageCents: transactionCount ? Math.round(totalCents / transactionCount) : 0,
    matchCount,
    hasMore: matchCount > rows.length,
  };
}

/** How far back the month stepper is allowed to walk. */
export async function loadEarliestTransaction(db: SQLiteDatabase): Promise<number | null> {
  const row = await db.getFirstAsync<{ earliest: number | null }>(
    `SELECT MIN(occurred_at) AS earliest FROM transactions WHERE deleted_at IS NULL`,
  );
  return row?.earliest ?? null;
}

/**
 * Chips for the category filter. Deliberately not `listCategories`, which hides
 * archived rows — a category archived by deselection still labels old spending,
 * so it has to stay filterable.
 */
export async function loadUsedCategories(
  db: SQLiteDatabase,
): Promise<{ id: string; name: string }[]> {
  return db.getAllAsync<{ id: string; name: string }>(
    `SELECT DISTINCT c.id, c.name, c.sort_order
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
      WHERE t.deleted_at IS NULL AND c.deleted_at IS NULL
      ORDER BY c.sort_order`,
  );
}

/**
 * The 'YYYY-MM' keys that hold at least one transaction, for the month picker.
 * Local time, matching how the rest of the app buckets a month — `strftime`
 * would otherwise cut the month at UTC midnight.
 */
export async function loadTransactionMonths(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ month: string }>(
    `SELECT DISTINCT strftime('%Y-%m', occurred_at / 1000, 'unixepoch', 'localtime') AS month
       FROM transactions
      WHERE deleted_at IS NULL
      ORDER BY month`,
  );
  return rows.map((r) => r.month);
}
