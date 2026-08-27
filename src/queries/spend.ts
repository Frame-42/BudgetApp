import type { SQLiteDatabase } from 'expo-sqlite';
import { dayLabel, startOfDay, startOfMonth, startOfNextMonth } from '../time';

export type SpendItem = {
  id: string;
  merchant: string;
  category: string;
  amountCents: number;
  income: boolean;
};

export type SpendData = {
  totalCents: number;
  transactionCount: number;
  averageCents: number;
  groups: { key: string; title: string; items: SpendItem[] }[];
};

/** The Spend screen: this month's outgoings, grouped by day. */
export async function loadSpend(db: SQLiteDatabase, at: number = Date.now()): Promise<SpendData> {
  const monthStart = startOfMonth(at);
  const monthEnd = startOfNextMonth(at);

  const rows = await db.getAllAsync<{
    id: string;
    merchant: string;
    amount_cents: number;
    occurred_at: number;
    category: string | null;
  }>(
    `SELECT t.id, t.merchant, t.amount_cents, t.occurred_at, c.name AS category
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.deleted_at IS NULL AND t.occurred_at >= ? AND t.occurred_at < ?
      ORDER BY t.occurred_at DESC`,
    [monthStart, monthEnd],
  );

  const expenses = rows.filter((r) => r.amount_cents < 0);
  const totalCents = expenses.reduce((sum, r) => sum - r.amount_cents, 0);

  const groups: SpendData['groups'] = [];
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
      category: (row.category ?? 'Income').toUpperCase(),
      amountCents: row.amount_cents,
      income: row.amount_cents > 0,
    });
  }

  return {
    totalCents,
    transactionCount: expenses.length,
    averageCents: expenses.length ? Math.round(totalCents / expenses.length) : 0,
    groups,
  };
}
