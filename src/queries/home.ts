import type { SQLiteDatabase } from 'expo-sqlite';
import { effectiveLimits, monthlyBudgetCents } from '../repo/budgets';
import { listCategories } from '../repo/categories';
import { nextDue } from '../repo/recurring';
import { daysInMonth, monthKey, shortDate, startOfDay, startOfMonth, startOfNextMonth, startOfWeek } from '../time';

export type HomeData = {
  month: string;
  leftToSpendCents: number;
  monthBudgetCents: number;
  daysRemaining: number;
  percentUsed: number;
  /** Positive when spending is behind the straight-line pace. */
  aheadOfPaceCents: number;
  dailyPaceCents: number;
  dailyAvailableCents: number;
  /** Monday-first; `future` days are the rest of this week. */
  week: { fraction: number; today: boolean; future: boolean }[];
  categories: { id: string; name: string; spentCents: number; limitCents: number; fill: number; alpha: number }[];
  categoryCount: number;
  nextOut: { label: string; amountCents: number } | null;
};

/** Everything the Home screen shows, derived from stored rows. */
export async function loadHome(db: SQLiteDatabase, at: number = Date.now()): Promise<HomeData> {
  const month = monthKey(at);
  const monthStart = startOfMonth(at);
  const monthEnd = startOfNextMonth(at);

  const spentRow = await db.getFirstAsync<{ spent: number }>(
    `SELECT IFNULL(SUM(-amount_cents), 0) AS spent FROM transactions
      WHERE deleted_at IS NULL AND amount_cents < 0
        AND occurred_at >= ? AND occurred_at < ?`,
    [monthStart, monthEnd],
  );
  const spentCents = spentRow?.spent ?? 0;
  const monthBudgetCents = (await monthlyBudgetCents(db, month)) ?? 0;
  const leftToSpendCents = monthBudgetCents - spentCents;

  const totalDays = daysInMonth(at);
  const dayOfMonth = new Date(at).getDate();
  const daysRemaining = totalDays - dayOfMonth;
  const expectedByNow = Math.round((monthBudgetCents * dayOfMonth) / totalDays);

  // --- this week ------------------------------------------------------------
  const weekStart = startOfWeek(at);
  const dailyRows = await db.getAllAsync<{ day: number; spent: number }>(
    `SELECT CAST((occurred_at - ?) / 86400000 AS INTEGER) AS day,
            IFNULL(SUM(-amount_cents), 0) AS spent
       FROM transactions
      WHERE deleted_at IS NULL AND amount_cents < 0 AND occurred_at >= ?
      GROUP BY day`,
    [weekStart, weekStart],
  );
  const byDay = new Map(dailyRows.map((r) => [r.day, r.spent]));
  const peak = Math.max(1, ...dailyRows.map((r) => r.spent));
  const todayIndex = Math.round((startOfDay(at) - weekStart) / 86_400_000);
  const week = Array.from({ length: 7 }, (_, i) => ({
    fraction: (byDay.get(i) ?? 0) / peak,
    today: i === todayIndex,
    future: i > todayIndex,
  }));

  // --- categories -----------------------------------------------------------
  const [categories, limits] = await Promise.all([listCategories(db), effectiveLimits(db, month)]);
  const spentRows = await db.getAllAsync<{ category_id: string; spent: number }>(
    `SELECT category_id, IFNULL(SUM(-amount_cents), 0) AS spent FROM transactions
      WHERE deleted_at IS NULL AND amount_cents < 0 AND category_id IS NOT NULL
        AND occurred_at >= ? AND occurred_at < ?
      GROUP BY category_id`,
    [monthStart, monthEnd],
  );
  const spentByCategory = new Map(spentRows.map((r) => [r.category_id, r.spent]));

  const due = await nextDue(db, at);

  return {
    month: new Date(at).toLocaleString('en-US', { month: 'long' }),
    leftToSpendCents,
    monthBudgetCents,
    daysRemaining,
    percentUsed: monthBudgetCents > 0 ? Math.round((spentCents / monthBudgetCents) * 100) : 0,
    aheadOfPaceCents: expectedByNow - spentCents,
    dailyPaceCents: Math.round(spentCents / Math.max(1, dayOfMonth)),
    dailyAvailableCents: Math.round(leftToSpendCents / Math.max(1, daysRemaining)),
    week,
    // Every live category, in the user's order. The canvas showed only the first
    // three, but onboarding now asks for a limit per category, and a card that
    // lists three of them makes the other seven look like they were dropped.
    // `listCategories` already filters the archived ones, so this is exactly the
    // set the user kept.
    categories: categories.map((c) => {
      const spent = spentByCategory.get(c.id) ?? 0;
      const limit = limits.get(c.id) ?? 0;
      return {
        id: c.id,
        name: c.name,
        spentCents: spent,
        limitCents: limit,
        fill: limit > 0 ? Math.min(1, spent / limit) : 0,
        alpha: c.color_alpha,
      };
    }),
    categoryCount: categories.length,
    nextOut: due
      ? { label: `${due.label} · ${shortDate(due.next_due_at)}`, amountCents: due.amount_cents }
      : null,
  };
}
