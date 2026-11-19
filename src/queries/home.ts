import type { SQLiteDatabase } from 'expo-sqlite';
import { effectiveLimits, monthlyBudgetCents } from '../repo/budgets';
import { listCategories } from '../repo/categories';
import { listRecurring } from '../repo/recurring';
import { addMonths, daysInMonth, monthKey, startOfDay, startOfMonth, startOfNextMonth, startOfWeek } from '../time';
import { FORECAST_MONTHS, forecastTail, pastTails, projectSchedules, type DayRow } from './outlook';

/** Money already committed to a later date: a split part still to come, or a schedule's next occurrence. */
export type PlannedItem = { key: string; label: string; at: number; amountCents: number };

export type HomeData = {
  month: string;
  monthBudgetCents: number;
  /** Money out so far — up to now, not to the end of the month. */
  spentCents: number;
  /** Money out still to come this month: later split parts and unbooked recurring occurrences. */
  plannedCents: number;
  /** Budget less spent and planned. Negative once the month is over-committed. */
  freeCents: number;
  /** Days after today. */
  daysRemaining: number;
  /** Positive when spending is behind the straight-line pace. */
  aheadOfPaceCents: number;
  dailyPaceCents: number;
  /** What is free, per day left; never below zero. */
  dailyFreeCents: number;
  /**
   * Where the month is likely to land: spent, planned, and the median unplanned
   * rest of past months. Null until there are enough finished months to read.
   */
  forecast: { landingCents: number; vsBudgetCents: number; months: number } | null;
  /** Monday-first; `future` days are the rest of this week. */
  week: { fraction: number; today: boolean; future: boolean }[];
  categories: { id: string; name: string; spentCents: number; limitCents: number; fill: number; alpha: number }[];
  categoryCount: number;
  /** This month's planned items, soonest first. */
  comingUp: PlannedItem[];
  /** What next month already holds, against the budget that will be in force there. */
  nextMonth: { label: string; plannedCents: number; budgetCents: number | null };
};

/** Everything the Home screen shows, derived from stored rows. */
export async function loadHome(db: SQLiteDatabase, at: number = Date.now()): Promise<HomeData> {
  const month = monthKey(at);
  const monthStart = startOfMonth(at);
  const monthEnd = startOfNextMonth(at);

  const nextMonthStart = monthEnd;
  const nextMonthEnd = startOfNextMonth(nextMonthStart);

  // --- spent, and what is already booked for later --------------------------
  // Split purchases write every part up front, so a part dated the 25th is a
  // row on the 10th. It is planned money, not spent money, until its day.
  const spentRow = await db.getFirstAsync<{ spent: number }>(
    `SELECT IFNULL(SUM(-amount_cents), 0) AS spent FROM transactions
      WHERE deleted_at IS NULL AND amount_cents < 0
        AND occurred_at >= ? AND occurred_at <= ?`,
    [monthStart, at],
  );
  const spentCents = spentRow?.spent ?? 0;
  const bookedAhead = await db.getAllAsync<{ id: string; merchant: string; occurred_at: number; amount_cents: number }>(
    `SELECT id, merchant, occurred_at, amount_cents FROM transactions
      WHERE deleted_at IS NULL AND amount_cents < 0
        AND occurred_at > ? AND occurred_at < ?
      ORDER BY occurred_at`,
    [at, nextMonthEnd],
  );

  // --- what the schedules will book ------------------------------------------
  // From the month's start, not from now: an occurrence already due but not yet
  // booked has no row, so this is the only place it is counted.
  const projected = projectSchedules(await listRecurring(db), monthStart, nextMonthEnd);

  const planned: PlannedItem[] = [
    ...bookedAhead.map((r) => ({ key: r.id, label: r.merchant, at: r.occurred_at, amountCents: -r.amount_cents })),
    ...projected.map((p) => ({ key: `${p.recurringId}:${p.at}`, label: p.label, at: p.at, amountCents: p.cents })),
  ].sort((a, b) => a.at - b.at);
  const comingUp = planned.filter((p) => p.at < monthEnd);
  const sum = (items: PlannedItem[]) => items.reduce((total, p) => total + p.amountCents, 0);
  const plannedCents = sum(comingUp);
  const nextPlannedCents = sum(planned.filter((p) => p.at >= nextMonthStart));

  const monthBudgetCents = (await monthlyBudgetCents(db, month)) ?? 0;
  const freeCents = monthBudgetCents - spentCents - plannedCents;

  const totalDays = daysInMonth(at);
  const dayOfMonth = new Date(at).getDate();
  const daysRemaining = totalDays - dayOfMonth;
  const expectedByNow = Math.round((monthBudgetCents * dayOfMonth) / totalDays);

  // --- forecast --------------------------------------------------------------
  // Unplanned only: recurring occurrences and a split's later parts are already
  // in `planned`, so counting them in past months' rest would count rent twice.
  // A split's first part stays in — that is the moment of the purchase.
  const history = await db.getAllAsync<DayRow>(
    `SELECT strftime('%Y-%m', occurred_at / 1000, 'unixepoch', 'localtime') AS month,
            CAST(strftime('%d', occurred_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS day,
            COUNT(*) AS entries,
            IFNULL(SUM(CASE WHEN amount_cents < 0 AND recurring_id IS NULL AND IFNULL(split_index, 0) = 0
                            THEN -amount_cents END), 0) AS unplannedCents
       FROM transactions
      WHERE deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ?
      GROUP BY month, day`,
    [addMonths(at, -FORECAST_MONTHS), monthStart],
  );
  const tails = pastTails(history, at);
  const rest = forecastTail(tails, daysRemaining);
  const landingCents = rest === null ? null : spentCents + plannedCents + rest;

  const nextMonthBudget = await monthlyBudgetCents(db, monthKey(nextMonthStart));

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

  return {
    month: new Date(at).toLocaleString('en-US', { month: 'long' }),
    monthBudgetCents,
    spentCents,
    plannedCents,
    freeCents,
    daysRemaining,
    aheadOfPaceCents: expectedByNow - spentCents,
    dailyPaceCents: Math.round(spentCents / Math.max(1, dayOfMonth)),
    dailyFreeCents: Math.max(0, Math.round(freeCents / Math.max(1, daysRemaining))),
    forecast:
      landingCents === null
        ? null
        : { landingCents, vsBudgetCents: monthBudgetCents - landingCents, months: tails.length },
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
    comingUp,
    nextMonth: {
      label: new Date(nextMonthStart).toLocaleString('en-US', { month: 'long' }),
      plannedCents: nextPlannedCents,
      budgetCents: nextMonthBudget,
    },
  };
}
