/** Date helpers. Everything is local time and milliseconds since the epoch. */

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
