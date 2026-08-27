import type { SQLiteDatabase } from 'expo-sqlite';
import { MONTH_ABBR, addMonths, monthKey, startOfMonth, startOfNextMonth } from '../time';

export type TrendsData = {
  monthlyAverageCents: number;
  /** Percentage change of the recent quarter against the one before it. */
  deltaPercent: number | null;
  months: { key: string; label: string; totalCents: number; fraction: number; active: boolean }[];
  /** Cumulative spend by day of month, as fractions of the plot's height. */
  pace: { current: number[]; previous: number[] };
  paceDeltaCents: number;
  split: { name: string; percent: number; alpha: number; totalCents: number }[];
};

const MONTHS_SHOWN = 6;

/** The Trends screen: six months of shape, plus this month against last. */
export async function loadTrends(db: SQLiteDatabase, at: number = Date.now()): Promise<TrendsData> {
  const from = addMonths(at, -(MONTHS_SHOWN - 1));

  const rows = await db.getAllAsync<{ month: string; total: number }>(
    `SELECT strftime('%Y-%m', occurred_at / 1000, 'unixepoch', 'localtime') AS month,
            IFNULL(SUM(-amount_cents), 0) AS total
       FROM transactions
      WHERE deleted_at IS NULL AND amount_cents < 0 AND occurred_at >= ?
      GROUP BY month`,
    [from],
  );
  const totals = new Map(rows.map((r) => [r.month, r.total]));

  const months = Array.from({ length: MONTHS_SHOWN }, (_, i) => {
    const stamp = addMonths(at, -(MONTHS_SHOWN - 1 - i));
    const key = monthKey(stamp);
    return {
      key,
      label: MONTH_ABBR[new Date(stamp).getMonth()],
      totalCents: totals.get(key) ?? 0,
      fraction: 0,
      active: i === MONTHS_SHOWN - 1,
    };
  });
  const peak = Math.max(1, ...months.map((m) => m.totalCents));
  for (const month of months) month.fraction = month.totalCents / peak;

  const completed = months.filter((m) => !m.active);
  const monthlyAverageCents = completed.length
    ? Math.round(completed.reduce((sum, m) => sum + m.totalCents, 0) / completed.length)
    : 0;

  const recent = completed.slice(-3);
  const earlier = completed.slice(0, 3);
  const avg = (list: typeof completed) =>
    list.length ? list.reduce((sum, m) => sum + m.totalCents, 0) / list.length : 0;
  const deltaPercent = earlier.length && avg(earlier) > 0
    ? Math.round(((avg(recent) - avg(earlier)) / avg(earlier)) * 100)
    : null;

  // --- pace: cumulative spend, this month against last -----------------------
  const cumulative = async (start: number, end: number): Promise<number[]> => {
    const daily = await db.getAllAsync<{ day: number; total: number }>(
      `SELECT CAST(strftime('%d', occurred_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS day,
              IFNULL(SUM(-amount_cents), 0) AS total
         FROM transactions
        WHERE deleted_at IS NULL AND amount_cents < 0 AND occurred_at >= ? AND occurred_at < ?
        GROUP BY day ORDER BY day`,
      [start, end],
    );
    const byDay = new Map(daily.map((r) => [r.day, r.total]));
    const series: number[] = [];
    let running = 0;
    const days = new Date(end - 1).getDate();
    for (let day = 1; day <= days; day++) {
      running += byDay.get(day) ?? 0;
      series.push(running);
    }
    return series;
  };

  const currentSeries = (await cumulative(startOfMonth(at), startOfNextMonth(at))).slice(
    0,
    new Date(at).getDate(),
  );
  const previousSeries = await cumulative(addMonths(at, -1), startOfMonth(at));

  const scale = Math.max(1, ...currentSeries, ...previousSeries);
  const dayOfMonth = new Date(at).getDate();
  const paceDeltaCents =
    (previousSeries[dayOfMonth - 1] ?? previousSeries[previousSeries.length - 1] ?? 0) -
    (currentSeries[currentSeries.length - 1] ?? 0);

  // --- where it goes ---------------------------------------------------------
  const splitRows = await db.getAllAsync<{ name: string; alpha: number; total: number }>(
    `SELECT c.name, c.color_alpha AS alpha, IFNULL(SUM(-t.amount_cents), 0) AS total
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
      WHERE t.deleted_at IS NULL AND t.amount_cents < 0 AND t.occurred_at >= ?
      GROUP BY c.id
      ORDER BY total DESC`,
    [from],
  );
  const splitTotal = Math.max(1, splitRows.reduce((sum, r) => sum + r.total, 0));
  const top = splitRows.slice(0, 4);
  const restTotal = splitRows.slice(4).reduce((sum, r) => sum + r.total, 0);
  const split = [
    ...top.map((r) => ({
      name: r.name,
      percent: Math.round((r.total / splitTotal) * 100),
      alpha: r.alpha,
      totalCents: r.total,
    })),
    ...(restTotal > 0
      ? [
          {
            name: 'Other',
            percent: Math.round((restTotal / splitTotal) * 100),
            alpha: 0.16,
            totalCents: restTotal,
          },
        ]
      : []),
  ];

  return {
    monthlyAverageCents,
    deltaPercent,
    months,
    pace: {
      current: currentSeries.map((v) => v / scale),
      previous: previousSeries.map((v) => v / scale),
    },
    paceDeltaCents,
    split,
  };
}
