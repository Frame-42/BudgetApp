/** Date helpers. Everything is local time and milliseconds since the epoch. */

import type { Cadence } from './db/types';

export const startOfDay = (d: Date | number): number => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

export const startOfMonth = (d: Date | number): number => {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), 1).getTime();
};

export const startOfNextMonth = (d: Date | number): number => {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth() + 1, 1).getTime();
};

export const addMonths = (d: Date | number, n: number): number => {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth() + n, 1).getTime();
};

export function stepMonthWithinBounds(
  start: number,
  delta: number,
  earliest: number | null,
  at: number = Date.now(),
): number {
  const latestMonth = startOfMonth(at);
  const target = addMonths(start, delta);
  if (target > latestMonth) return latestMonth;
  if (earliest === null) return delta < 0 ? start : target;
  return Math.max(target, startOfMonth(earliest));
}

/**
 * The same day of the month, `n` months on, keeping the time of day — what a
 * split's later parts are dated to.
 *
 * `addMonths` lands on the 1st, which is right for a budget month and wrong
 * here: a payment made on the 28th should keep reading as the 28th. A day the
 * target month doesn't have is clamped to its last (31 Jan + 1 month -> 28 Feb)
 * rather than rolling into the month after, which is what `setMonth` would do
 * and would put two parts in one month.
 */
export function addMonthsKeepingDay(d: Date | number, n: number): number {
  const x = new Date(d);
  const target = new Date(x.getFullYear(), x.getMonth() + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(x.getDate(), lastDay));
  target.setHours(x.getHours(), x.getMinutes(), x.getSeconds(), x.getMilliseconds());
  return target.getTime();
}

/**
 * The `k`th occurrence of a schedule, counted from its anchor (k = 0).
 *
 * Always from the anchor, never from the previous occurrence — the rule split
 * parts follow too. Stepping month to month would let one short month clamp the
 * 31st to the 28th and keep it there; measured from the anchor, 31 Jan gives
 * 28 Feb and then 31 Mar. A week is seven calendar days rather than 604,800,000
 * ms, so a payment at 09:00 stays at 09:00 across a clock change.
 */
export function occurrenceAt(anchor: number, cadence: Cadence, k: number): number {
  if (cadence === 'week') {
    const x = new Date(anchor);
    x.setDate(x.getDate() + 7 * k);
    return x.getTime();
  }
  return addMonthsKeepingDay(anchor, cadence === 'year' ? 12 * k : k);
}

/**
 * Which occurrence `at` is — the inverse of `occurrenceAt`, for a date it
 * produced. That is what lets a schedule store only its anchor and its next due
 * date: the count between them is derived rather than kept in step by hand.
 */
export function occurrenceIndex(anchor: number, cadence: Cadence, at: number): number {
  const a = new Date(anchor);
  const b = new Date(at);
  if (cadence === 'week') {
    // Rounded, because a clock change makes one week an hour short or long.
    return Math.round((startOfDay(b) - startOfDay(a)) / (7 * 86_400_000));
  }
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return cadence === 'year' ? Math.floor(months / 12) : months;
}

/**
 * A guard, not a pace: ten years of a weekly schedule. Only a corrupt anchor
 * could ask for more in one pass, and a loop that never ends is worse than one
 * that finishes on the next launch.
 */
export const MAX_CATCH_UP = 520;

/**
 * Every occurrence from `nextDue` up to and including `at`, and where the
 * schedule stands afterwards. More than one when the app hasn't been opened for
 * a while — each missed occurrence is still real money on its own date.
 */
export function dueOccurrences(
  anchor: number,
  cadence: Cadence,
  nextDue: number,
  at: number,
  limit: number = MAX_CATCH_UP,
): { due: number[]; next: number } {
  const due: number[] = [];
  let k = occurrenceIndex(anchor, cadence, nextDue);
  let next = nextDue;
  while (next <= at && due.length < limit) {
    due.push(next);
    k += 1;
    next = occurrenceAt(anchor, cadence, k);
  }
  return { due, next };
}

/**
 * `day` with the time of day taken from `at` — what a back-dated expense is
 * stamped with. Midnight would sort it beneath everything else that day, and
 * the time it was entered is the closest thing to when it happened that the
 * app knows.
 */
export function onDay(day: number, at: number = Date.now()): number {
  const x = new Date(day);
  const t = new Date(at);
  x.setHours(t.getHours(), t.getMinutes(), t.getSeconds(), t.getMilliseconds());
  return x.getTime();
}

/**
 * A month laid out Monday-first, as the date picker draws it: the start of each
 * day, led by `null`s for the weekdays before the 1st. Rows are not padded at
 * the end, so the grid ends on the last day rather than on a row of blanks.
 */
export function calendarCells(month: Date | number): (number | null)[] {
  const first = new Date(startOfMonth(month));
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const cells: (number | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth(first); day++) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), day).getTime());
  }
  return cells;
}

export const daysInMonth = (d: Date | number): number => {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
};

/** 'YYYY-MM' — the key budgets are stored against. */
export const monthKey = (d: Date | number): string => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};

/** Monday-first, matching the design's seven-bar "This week" tile. */
export const startOfWeek = (d: Date | number): number => {
  const x = new Date(startOfDay(d));
  const weekday = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - weekday);
  return x.getTime();
};

export const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** 'Today' / 'Yesterday' / 'Tue 25 Aug' — the Spend screen's day headings. */
export function dayLabel(ts: number, reference: number = Date.now()): string {
  const day = startOfDay(ts);
  const today = startOfDay(reference);
  if (day === today) return 'Today';
  if (day === today - 86_400_000) return 'Yesterday';
  const d = new Date(day);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  const month = MONTH_ABBR[d.getMonth()];
  return `${weekday} ${d.getDate()} ${month.charAt(0)}${month.slice(1).toLowerCase()}`;
}

/** 'Sep 1' — the "Next out" tile. */
export const shortDate = (ts: number): string => {
  const d = new Date(ts);
  const month = MONTH_ABBR[d.getMonth()];
  return `${month.charAt(0)}${month.slice(1).toLowerCase()} ${d.getDate()}`;
};

/**
 * ISO 8601 in local time, with the offset: '2026-09-06T14:23:07.123+02:00'.
 *
 * `Date.parse` reads it back to the same millisecond, which is what the CSV
 * export needs. Local rather than `toISOString()`'s UTC because a purchase made
 * at 00:30 in Zurich is a UTC date of the day *before* — and a file whose dates
 * are off by one is worse than useless in a budget app.
 */
export function isoLocal(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  // getTimezoneOffset is minutes to add to reach UTC, so it runs the other way
  // round from the sign the format wants.
  const offset = -d.getTimezoneOffset();
  const abs = Math.abs(offset);
  return (
    `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}` +
    `${offset < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
