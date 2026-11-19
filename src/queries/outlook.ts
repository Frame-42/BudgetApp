import type { RecurringRow } from '../db/types';
import { splitAmounts } from '../db/split';
import {
  MAX_CATCH_UP,
  addMonths,
  addMonthsKeepingDay,
  daysInMonth,
  monthKey,
  occurrenceAt,
  occurrenceIndex,
} from '../time';

/**
 * What the rest of the month already holds and where it is likely to land —
 * the pure half of Home's "free to spend". Rows in, numbers out; `home.ts` does
 * the reading.
 */

/** The middle value; the mean of the middle two for an even count. Null when empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type ScheduleInput = Pick<
  RecurringRow,
  'id' | 'label' | 'amount_cents' | 'next_due_at' | 'anchor_at' | 'cadence' | 'split_months'
>;

/** One part of a recurring occurrence that has not been booked yet. Unsigned. */
export type ProjectedPart = { recurringId: string; label: string; at: number; cents: number };

/**
 * The parts of every not-yet-booked occurrence that land in `[from, until)`.
 *
 * Walks from `next_due_at`, not from now: an occurrence that has come due but
 * not been booked yet has no row, so nothing else counts it — it is still
 * planned money. Each occurrence is measured from the anchor and spread the way
 * `bookDueRecurring` will spread it (`splitAmounts`, day of the month kept), so
 * the figure projected is the figure that will be written.
 */
export function projectSchedules(schedules: ScheduleInput[], from: number, until: number): ProjectedPart[] {
  const parts: ProjectedPart[] = [];
  for (const s of schedules) {
    // Only money out is planned spending.
    if (s.amount_cents >= 0) continue;
    const anchor = s.anchor_at ?? s.next_due_at;
    const amounts = splitAmounts(s.amount_cents, s.split_months);
    let k = occurrenceIndex(anchor, s.cadence, s.next_due_at);
    let occurrence = s.next_due_at;
    for (let n = 0; occurrence < until && n < MAX_CATCH_UP; n++) {
      amounts.forEach((cents, i) => {
        const at = addMonthsKeepingDay(occurrence, i);
        if (at >= from && at < until) parts.push({ recurringId: s.id, label: s.label, at, cents: -cents });
      });
      k += 1;
      occurrence = occurrenceAt(anchor, s.cadence, k);
    }
  }
  return parts.sort((a, b) => a.at - b.at);
}

/** One day of an earlier month: whether anything was recorded, and the unplanned spend. */
export type DayRow = { month: string; day: number; entries: number; unplannedCents: number };

/** How much unplanned money one past month spent after the cut-off day, and over how many days. */
export type Tail = { cents: number; days: number };

/** How many finished months the forecast reads. Half a year: recent enough to track a change in habits. */
export const FORECAST_MONTHS = 6;

/**
 * For each of the `months` finished months before `at` that recorded anything,
 * the unplanned spend after the same day of the month as today.
 *
 * A month with no rows at all is missing data, not a month of no spending, and
 * sits out — the rule Trends follows. The cut-off is clamped to the month's
 * second-last day, so on the 30th a February still contributes its last day's
 * rate rather than an empty tail.
 */
export function pastTails(rows: DayRow[], at: number, months: number = FORECAST_MONTHS): Tail[] {
  const today = new Date(at).getDate();
  const byMonth = new Map<string, DayRow[]>();
  for (const row of rows) byMonth.set(row.month, [...(byMonth.get(row.month) ?? []), row]);

  const tails: Tail[] = [];
  for (let back = 1; back <= months; back++) {
    const stamp = addMonths(at, -back);
    const days = byMonth.get(monthKey(stamp)) ?? [];
    if (!days.some((d) => d.entries > 0)) continue;
    const length = daysInMonth(stamp);
    const cutoff = Math.min(today, length - 1);
    tails.push({
      cents: days.filter((d) => d.day > cutoff).reduce((sum, d) => sum + d.unplannedCents, 0),
      days: length - cutoff,
    });
  }
  return tails;
}

/** Below this many months a median is one month's accident, so there is no forecast. */
export const MIN_FORECAST_MONTHS = 2;

/** The median per-day rate of unplanned spending across past tails; null without enough history. */
export function forecastRate(tails: Tail[]): number | null {
  const rates = tails.filter((t) => t.days > 0).map((t) => t.cents / t.days);
  return rates.length < MIN_FORECAST_MONTHS ? null : median(rates);
}

/**
 * The unplanned spending still to come this month: the median day rate of the
 * past tails, times the days left after today. Null without enough history —
 * the design never invents a figure.
 */
export function forecastTail(tails: Tail[], daysLeft: number): number | null {
  const rate = forecastRate(tails);
  return rate === null ? null : Math.round(rate * Math.max(0, daysLeft));
}

/**
 * For each day after today, the median of what the same finished months
 * `pastTails` reads spent unplanned on that day of the month — the shape of
 * the rest of a typical month. A month without that day (a 31st, February's
 * 29th–31st) sits out for it rather than counting as a day of nothing.
 */
export function dayMedians(rows: DayRow[], at: number, months: number = FORECAST_MONTHS): number[] {
  const today = new Date(at).getDate();
  const totalDays = daysInMonth(at);
  const byMonth = new Map<string, Map<number, DayRow>>();
  for (const row of rows) {
    const days = byMonth.get(row.month) ?? new Map<number, DayRow>();
    days.set(row.day, row);
    byMonth.set(row.month, days);
  }
  const basis: { length: number; days: Map<number, DayRow> }[] = [];
  for (let back = 1; back <= months; back++) {
    const stamp = addMonths(at, -back);
    const days = byMonth.get(monthKey(stamp));
    if (days && [...days.values()].some((d) => d.entries > 0)) basis.push({ length: daysInMonth(stamp), days });
  }
  return Array.from({ length: totalDays - today }, (_, i) => {
    const day = today + 1 + i;
    const values = basis.filter((m) => m.length >= day).map((m) => m.days.get(day)?.unplannedCents ?? 0);
    return median(values) ?? 0;
  });
}

/**
 * The rest of this month as a cumulative curve, today's standing first and
 * one point per day after it.
 *
 * Planned money steps on its own date. The unplanned rest takes its *shape*
 * from `dayMedians` and its *size* from `tailCents` — Home's forecast — so the
 * line ends exactly where Home says the month will land. Both halves are
 * needed: across six irregular months most days' median is 0, so the medians
 * alone would understate the month badly, and a flat rate alone would hide the
 * day the money usually goes. With no shape at all the rest is spread evenly.
 * Each point is rounded on its own and the last is exact, so no cent drifts.
 */
export function forecastCurve({
  standing,
  plannedByDay,
  medians,
  tailCents,
  today,
}: {
  standing: number;
  /** Cents keyed by day of the month. */
  plannedByDay: Map<number, number>;
  /** One per day after today, from `dayMedians`. */
  medians: number[];
  tailCents: number;
  today: number;
}): number[] {
  const weight = medians.reduce((sum, m) => sum + m, 0);
  const share = (i: number) =>
    medians.length === 0 ? 0 : weight > 0 ? (tailCents * medians[i]) / weight : tailCents / medians.length;
  const curve = [standing];
  let running = standing;
  medians.forEach((_, i) => {
    running += (plannedByDay.get(today + 1 + i) ?? 0) + share(i);
    curve.push(Math.round(running));
  });
  if (medians.length) {
    const planned = medians.reduce((sum, _, i) => sum + (plannedByDay.get(today + 1 + i) ?? 0), 0);
    curve[curve.length - 1] = standing + planned + tailCents;
  }
  return curve;
}
