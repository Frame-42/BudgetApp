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
