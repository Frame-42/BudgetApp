import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import {
  MONTH_ABBR,
  addMonths,
  daysInMonth,
  monthKey,
  startOfNextMonth,
} from '../time';

export type Share = {
  name: string;
  percent: number;
  alpha: number;
  totalCents: number;
  /** Usually one id; the rolled-up "Other" row carries every category it folds in. */
  categoryIds: string[];
};

/** How far back the screen looks: a quarter, a half year, or a year. */
export const TREND_SPANS = [3, 6, 12] as const;
export type TrendSpan = (typeof TREND_SPANS)[number];

/** The longest span. Every shorter one is its tail, so one pass of rows serves all three. */
const WIDEST: TrendSpan = TREND_SPANS[TREND_SPANS.length - 1];

/** One bar in the month row, with everything the screen shows when it is tapped. */
export type MonthStat = {
  /** 'YYYY-MM'. */
  key: string;
  label: string;
  totalCents: number;
  /** Rows behind the figure — what the "see transactions" strip names. */
  matchCount: number;
  /** Against the span's peak, for the bar's height. */
  fraction: number;
  /** The in-progress month. */
  active: boolean;
  /**
   * Whether the month holds any transaction at all. A month that holds none is
   * missing data rather than a month of no spending, so it is kept out of every
   * figure the screen derives and cannot be picked.
   */
  present: boolean;
  /** Whether the month before it has anything to compare against. */
  hasPrevious: boolean;
  /** Whether there is an average made of other months to read this one against. */
  hasAverage: boolean;
  /**
   * Against the span's average; null before there is an average to compare to.
   * A month still running is measured against where an average month had got to
   * by the same day, not against a whole one.
   */
  deltaVsAveragePercent: number | null;
  /**
   * Cumulative spend by day: this month, and the two curves it can be read
   * against. All three share one peak, so switching the comparison moves the
   * dashed line without shifting the solid one.
   */
  pace: { current: number[]; previous: number[]; average: number[] };
  /** How much lighter this month runs than each comparison, at the same point. */
  paceDeltaCents: { previous: number; average: number };
  /** The month the dashed line is drawn from — 'JUL' for August. */
  previousLabel: string;
  split: Share[];
};

export type TrendsData = {
  /** How many months this view covers. */
  span: TrendSpan;
  monthlyAverageCents: number;
  /** Rows across the whole span, for the hand-off when no month is picked. */
  matchCount: number;
  /** Percentage change of the completed months' recent half against the half before it. */
  deltaPercent: number | null;
  months: MonthStat[];
  /** The average month as a cumulative curve, for the resting chart. */
  averagePace: number[];
  /** What a day costs in an average month — or so far this month, when partial. */
  averageDailyCents: number;
  /** How many months the average is built from. */
  averageMonths: number;
  /**
   * The average is the month in progress, because no month has finished yet.
   * The screen says "this month" rather than "an average month" when it is.
   */
  averageIsPartial: boolean;
  /** The whole span's split, for when no month is selected. */
  split: Share[];
};

/** Every span, ready to switch between without going back to the database. */
export type TrendsBundle = Record<TrendSpan, TrendsData>;

type SplitRow = { id: string; name: string; alpha: number; total: number };

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Integer percentages that preserve the weights and add up to exactly 100. */
export function apportionPercentages(weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total === 0) return weights.map(() => 0);

  const exact = weights.map((weight) => (Math.max(0, weight) / total) * 100);
  const result = exact.map(Math.floor);
  const remaining = 100 - result.reduce((sum, percent) => sum + percent, 0);
  const byRemainder = exact
    .map((percent, index) => ({ index, remainder: percent - result[index] }))
    .sort((a, b) => b.remainder - a.remainder || weights[b.index] - weights[a.index] || a.index - b.index);
  for (let i = 0; i < remaining; i++) result[byRemainder[i].index]++;
  return result;
}

/** Top four categories by spend, with the tail rolled into "Other". */
export function toSplit(rows: SplitRow[]): Share[] {
  const ranked = [...rows].sort(
    (a, b) => b.total - a.total || compareText(a.name, b.name) || compareText(a.id, b.id),
  );
  const shares: Share[] = ranked.slice(0, 4).map((r) => ({
    name: r.name,
    percent: 0,
    alpha: r.alpha,
    totalCents: r.total,
    categoryIds: [r.id],
  }));

  const rest = ranked.slice(4);
  const restTotal = rest.reduce((sum, r) => sum + r.total, 0);
  if (restTotal > 0) {
    // One of the seven categories is itself called "Other". When it lands in the
    // top four the tail folds into it, rather than sitting beside it as a second
    // slice of the same name. Either way the row carries every id it stands for,
    // so selecting it selects the whole tail.
    const named = shares.find((share) => share.name === 'Other');
    if (named) {
      named.totalCents += restTotal;
      named.categoryIds = [...named.categoryIds, ...rest.map((r) => r.id)];
    } else {
      shares.push({
        name: 'Other',
        percent: 0,
        alpha: 0.16,
        totalCents: restTotal,
        categoryIds: rest.map((r) => r.id),
      });
    }
  }

  shares.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      compareText(a.name, b.name) ||
      compareText(a.categoryIds.join('\0'), b.categoryIds.join('\0')),
  );
  const percentages = apportionPercentages(shares.map((share) => share.totalCents));
  shares.forEach((share, index) => {
    share.percent = percentages[index];
  });
  return shares;
}

/** All three current Trends spans from one bounded database snapshot. */
export async function loadTrends(
  db: SQLiteDatabase,
  at: number = Date.now(),
  categoryIds: string[] = [],
): Promise<TrendsBundle> {
  /*
   * Every figure narrows to the chosen categories, but a month's *presence*
   * must not: a month with no Groceries is a month with no Groceries, not the
   * missing data `present` stands for. So the predicate goes inside the sums
   * rather than into the WHERE of the query that counts entries.
  */
  const chosen = categoryIds.length ? `category_id IN (${categoryIds.map(() => '?').join(', ')})` : '1';
  /** One month further back than the widest row shows, so its oldest bar has a pace line to sit over. */
  const sourceStart = addMonths(at, -WIDEST);
  const sourceEnd = startOfNextMonth(at);

  let rows: {
    month: string;
    entries: number;
    matches: number;
    total: number;
  }[] = [];
  let daily: { month: string; day: number; total: number }[] = [];
  let splitRows: ({ month: string } & SplitRow)[] = [];

  const read = async (txn: SQLiteDatabase) => {
    // Counted over every transaction, not just spending, so a month that holds
    // only income still counts as a month that was recorded.
    [rows, daily, splitRows] = await Promise.all([
      txn.getAllAsync<{
        month: string;
        entries: number;
        matches: number;
        total: number;
      }>(
        `SELECT strftime('%Y-%m', occurred_at / 1000, 'unixepoch', 'localtime') AS month,
              COUNT(*) AS entries,
              SUM(CASE WHEN ${chosen} THEN 1 ELSE 0 END) AS matches,
              IFNULL(SUM(CASE WHEN amount_cents < 0 AND ${chosen} THEN -amount_cents END), 0) AS total
         FROM transactions
        WHERE deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ?
        GROUP BY month`,
        [...categoryIds, ...categoryIds, sourceStart, sourceEnd],
      ),
      txn.getAllAsync<{ month: string; day: number; total: number }>(
        `SELECT strftime('%Y-%m', occurred_at / 1000, 'unixepoch', 'localtime') AS month,
              CAST(strftime('%d', occurred_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS day,
              IFNULL(SUM(-amount_cents), 0) AS total
         FROM transactions
        WHERE deleted_at IS NULL AND amount_cents < 0 AND ${chosen}
          AND occurred_at >= ? AND occurred_at < ?
        GROUP BY month, day`,
        [...categoryIds, sourceStart, sourceEnd],
      ),
      txn.getAllAsync<{ month: string } & SplitRow>(
        `SELECT strftime('%Y-%m', t.occurred_at / 1000, 'unixepoch', 'localtime') AS month,
              c.id, c.name, c.color_alpha AS alpha, IFNULL(SUM(-t.amount_cents), 0) AS total
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
        WHERE t.deleted_at IS NULL AND t.amount_cents < 0
          AND t.occurred_at >= ? AND t.occurred_at < ?
        GROUP BY month, c.id`,
        [sourceStart, sourceEnd],
      ),
    ]);
  };

  // Native gets an isolated transaction handle. Expo SQLite does not support
  // that API on web, where the ordinary transaction is still preferable to
  // three unrelated reads.
  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => read(db));
  } else {
    await db.withExclusiveTransactionAsync(read);
  }
  const totals = new Map(rows.map((r) => [r.month, r.total]));
  const matches = new Map(rows.map((r) => [r.month, r.matches]));
  const recorded = new Set(rows.filter((r) => r.entries > 0).map((r) => r.month));

  // --- pace: every month's cumulative curve, in one pass ----------------------
  const byMonthDay = new Map<string, Map<number, number>>();
  for (const row of daily) {
    const days = byMonthDay.get(row.month) ?? new Map<number, number>();
    days.set(row.day, row.total);
    byMonthDay.set(row.month, days);
  }
  const cumulative = (stamp: number): number[] => {
    const days = byMonthDay.get(monthKey(stamp));
    const series: number[] = [];
    let running = 0;
    for (let day = 1; day <= daysInMonth(stamp); day++) {
      running += days?.get(day) ?? 0;
      series.push(running);
    }
    return series;
  };

  // --- where it goes, per month ----------------------------------------------
  /* Deliberately unfiltered: selecting a category must not redraw the donut as
     100% of itself, or there would be no way to add a second. */
  const splitByMonth = new Map<string, SplitRow[]>();
  for (const row of splitRows) {
    splitByMonth.set(row.month, [...(splitByMonth.get(row.month) ?? []), row]);
  }

  const build = (viewSpan: TrendSpan): TrendsData => {
    const stamps = Array.from(
      { length: viewSpan },
      (_, i) => addMonths(at, -(viewSpan - 1 - i)),
    );
    const shown = stamps.map((stamp, i) => {
      const key = monthKey(stamp);
      const active = i === viewSpan - 1;
      return {
        key,
        label: MONTH_ABBR[new Date(stamp).getMonth()],
        totalCents: totals.get(key) ?? 0,
        matchCount: matches.get(key) ?? 0,
        active,
        // The month in progress is present by definition, even before its first row.
        present: active || recorded.has(key),
        hasPrevious: recorded.has(monthKey(addMonths(stamp, -1))),
      };
    });

    const peak = Math.max(1, ...shown.map((m) => m.totalCents));

    const dayOfMonth = new Date(at).getDate();
    /** A month's cumulative curve. The one in progress stops at today. */
    const curve = (stamp: number, active: boolean) =>
      active ? cumulative(stamp).slice(0, dayOfMonth) : cumulative(stamp);

    // Months with nothing recorded sit out of every average and comparison below.
    const completed = shown.filter((m) => !m.active && m.present);
    /**
     * Before any month has finished there is nothing to average, so the month in
     * progress stands as the only month there is: its total, its curve and its
     * day rate carry the screen, and every expense added today moves them. The
     * first month to finish takes over, and the running month goes back to being
     * read against finished ones rather than standing for them.
     */
    const averageIsPartial = completed.length === 0;
    const basisIndexes = averageIsPartial
      ? [viewSpan - 1]
      : shown.map((_, i) => i).filter((i) => !shown[i].active && shown[i].present);
    const basis = basisIndexes.map((i) => shown[i]);
    const basisKeys = new Set(basis.map((m) => m.key));
    const monthlyAverageCents = Math.round(
      basis.length ? basis.reduce((sum, m) => sum + m.totalCents, 0) / basis.length : 0,
    );

    // Two halves of equal length, so no month is counted on both sides of the
    // comparison. An odd month in the middle sits out.
    const half = Math.floor(completed.length / 2);
    const avg = (list: typeof completed) =>
      list.length ? list.reduce((sum, m) => sum + m.totalCents, 0) / list.length : 0;
    const earlier = completed.slice(0, half);
    const deltaPercent = half && avg(earlier) > 0
      ? Math.round(((avg(completed.slice(-half)) - avg(earlier)) / avg(earlier)) * 100)
      : null;

    /**
     * The average month, day by day. Months shorter than the longest one hold at
     * their final total, so the curve still ends on `monthlyAverageCents`.
     */
    const basisSeries = basisIndexes.map((i) => curve(stamps[i], shown[i].active));
    const averageSpan = Math.max(0, ...basisSeries.map((series) => series.length));
    const averageSeries = Array.from({ length: averageSpan }, (_, i) =>
      Math.round(
        basisSeries.reduce((sum, series) => sum + (series[i] ?? series[series.length - 1] ?? 0), 0) /
          basisSeries.length,
      ),
    );
    const averagePeak = Math.max(1, ...averageSeries);

    const overall = new Map<string, SplitRow>();
    for (const month of shown) {
      for (const row of splitByMonth.get(month.key) ?? []) {
        const seen = overall.get(row.id);
        if (seen) seen.total += row.total;
        else overall.set(row.id, { ...row });
      }
    }

    const months: MonthStat[] = shown.map((month, i) => {
      const stamp = stamps[i];
      // The in-progress month stops at today; a finished one runs to its last day.
      const current = curve(stamp, month.active);
      const previous = cumulative(addMonths(stamp, -1));
      const scale = Math.max(1, ...current, ...previous, ...averageSeries);
      const day = current.length;
      const standing = current[current.length - 1] ?? 0;
      /* Where a comparison had got to by the same day; a shorter month holds at its total. */
      const sameDay = (series: number[]) => series[day - 1] ?? series[series.length - 1] ?? 0;

      const averageSoFar = sameDay(averageSeries);
      /* An average made of this month alone has nothing to tell it about itself. */
      const hasAverage = basisKeys.size > 1 || !basisKeys.has(month.key);

      return {
        ...month,
        hasAverage,
        fraction: month.totalCents / peak,
        // Two days of September against a whole average month reads as a 95%
        // saving, so a running month is compared at the point it has reached —
        // the same span the pace line under the chart uses.
        deltaVsAveragePercent: !month.present || !hasAverage
          ? null
          : month.active
            ? averageSoFar > 0
              ? Math.round(((standing - averageSoFar) / averageSoFar) * 100)
              : null
            : monthlyAverageCents > 0
              ? Math.round(((month.totalCents - monthlyAverageCents) / monthlyAverageCents) * 100)
              : null,
        pace: {
          current: current.map((v) => v / scale),
          previous: previous.map((v) => v / scale),
          average: averageSeries.map((v) => v / scale),
        },
        // Same span of both curves, so a short February never reads as a saving.
        paceDeltaCents: {
          previous: sameDay(previous) - standing,
          average: averageSoFar - standing,
        },
        previousLabel: MONTH_ABBR[new Date(addMonths(stamp, -1)).getMonth()],
        split: toSplit(splitByMonth.get(month.key) ?? []),
      };
    });

    return {
      span: viewSpan,
      monthlyAverageCents,
      matchCount: shown.reduce((sum, m) => sum + m.matchCount, 0),
      deltaPercent,
      months,
      averagePace: averageSeries.map((v) => v / averagePeak),
      averageDailyCents: averageSpan ? Math.round(monthlyAverageCents / averageSpan) : 0,
      averageMonths: basis.length,
      averageIsPartial,
      split: toSplit([...overall.values()]),
    };
  };

  return Object.fromEntries(
    TREND_SPANS.map((viewSpan) => [viewSpan, build(viewSpan)]),
  ) as TrendsBundle;
}
