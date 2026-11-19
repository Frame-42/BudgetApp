import {
  dayMedians,
  forecastCurve,
  forecastTail,
  median,
  pastTails,
  projectSchedules,
  type DayRow,
  type ScheduleInput,
} from '../outlook';

const day = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h).getTime();

const schedule = (over: Partial<ScheduleInput>): ScheduleInput => ({
  id: 'r1',
  label: 'Rent',
  amount_cents: -100_000,
  next_due_at: day(2026, 10, 25),
  anchor_at: null,
  cadence: 'month',
  split_months: 1,
  ...over,
});

describe('median', () => {
  it('takes the middle of an odd count and the mean of the middle two of an even one', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('is null when there is nothing to take the middle of', () => {
    expect(median([])).toBeNull();
  });
});

describe('projectSchedules', () => {
  const novStart = day(2026, 10, 1, 0);
  const janStart = day(2027, 0, 1, 0);

  it('counts an occurrence still due this month, and the one next month', () => {
    const parts = projectSchedules([schedule({})], novStart, janStart);
    expect(parts.map((p) => [new Date(p.at).getMonth(), p.cents])).toEqual([
      [10, 100_000],
      [11, 100_000],
    ]);
  });

  it('keeps an overdue occurrence that has not been booked yet', () => {
    const parts = projectSchedules([schedule({ next_due_at: day(2026, 10, 2) })], novStart, day(2026, 11, 1, 0));
    expect(parts).toHaveLength(1);
    expect(new Date(parts[0].at).getDate()).toBe(2);
  });

  it('measures from the anchor, so the 31st clamps in February and comes back in March', () => {
    const parts = projectSchedules(
      [schedule({ anchor_at: day(2027, 0, 31), next_due_at: day(2027, 1, 28) })],
      day(2027, 1, 1, 0),
      day(2027, 3, 1, 0),
    );
    expect(parts.map((p) => new Date(p.at).getDate())).toEqual([28, 31]);
  });

  it('books a weekly schedule as many times as the month holds it', () => {
    const parts = projectSchedules(
      [schedule({ cadence: 'week', amount_cents: -1_000, next_due_at: day(2026, 10, 2) })],
      novStart,
      day(2026, 11, 1, 0),
    );
    expect(parts.map((p) => new Date(p.at).getDate())).toEqual([2, 9, 16, 23, 30]);
  });

  it('spreads each occurrence the way the booking will, spilling into next month', () => {
    const parts = projectSchedules(
      [schedule({ cadence: 'year', amount_cents: -1_000, split_months: 3, next_due_at: day(2026, 10, 20) })],
      novStart,
      janStart,
    );
    expect(parts.map((p) => [new Date(p.at).getMonth(), p.cents])).toEqual([
      [10, 334],
      [11, 333],
    ]);
  });

  it('ignores money in', () => {
    expect(projectSchedules([schedule({ amount_cents: 5_000 })], novStart, janStart)).toEqual([]);
  });
});

describe('pastTails', () => {
  const row = (month: string, d: number, unplannedCents: number, entries = 1): DayRow => ({
    month,
    day: d,
    entries,
    unplannedCents,
  });

  it('sums what each finished month spent after today, skipping months with nothing recorded', () => {
    const at = day(2026, 10, 20);
    const tails = pastTails(
      [row('2026-10', 5, 900), row('2026-10', 21, 100), row('2026-10', 31, 200), row('2026-08', 25, 300)],
      at,
    );
    expect(tails).toEqual([
      { cents: 300, days: 11 },
      { cents: 300, days: 11 },
    ]);
  });

  it('still reads February on the 30th, from its last day', () => {
    const tails = pastTails([row('2027-02', 28, 700)], day(2027, 2, 30), 1);
    expect(tails).toEqual([{ cents: 700, days: 1 }]);
  });
});

describe('forecastTail', () => {
  it('is null with fewer than two months to read', () => {
    expect(forecastTail([{ cents: 1_000, days: 10 }], 10)).toBeNull();
  });

  it('takes the median day rate, so one splurge month does not move it', () => {
    const tails = [
      { cents: 1_000, days: 10 },
      { cents: 1_200, days: 10 },
      { cents: 90_000, days: 10 },
    ];
    expect(forecastTail(tails, 5)).toBe(600);
  });

  it('expects nothing more on the last day of the month', () => {
    expect(forecastTail([{ cents: 1_000, days: 10 }, { cents: 2_000, days: 10 }], 0)).toBe(0);
  });
});

describe('dayMedians', () => {
  const row = (month: string, d: number, unplannedCents: number): DayRow => ({
    month,
    day: d,
    entries: 1,
    unplannedCents,
  });

  it('shows the day the money usually goes', () => {
    // 27 Nov: four days left. Three of four months spent 100 € on the 28th.
    const at = day(2026, 10, 27);
    const medians = dayMedians(
      [row('2026-10', 28, 10_000), row('2026-09', 28, 10_000), row('2026-08', 28, 12_000), row('2026-07', 2, 500)],
      at,
    );
    expect(medians).toEqual([10_000, 0, 0]);
  });

  it('leaves a month out of a day it does not have', () => {
    // 30 Dec: only the 31st is left. November has no 31st, so October answers alone.
    const medians = dayMedians([row('2026-11', 5, 100), row('2026-10', 31, 4_000)], day(2026, 11, 30));
    expect(medians).toEqual([4_000]);
  });
});

describe('forecastCurve', () => {
  it('starts at today, steps on planned days and ends on the forecast', () => {
    const curve = forecastCurve({
      standing: 1_000,
      plannedByDay: new Map([[29, 500]]),
      medians: [0, 300, 100],
      tailCents: 800,
      today: 27,
    });
    expect(curve).toEqual([1_000, 1_000, 1_000 + 500 + 600, 1_000 + 500 + 800]);
  });

  it('spreads the rest evenly when no day has a shape', () => {
    expect(
      forecastCurve({ standing: 0, plannedByDay: new Map(), medians: [0, 0, 0, 0], tailCents: 100, today: 26 }),
    ).toEqual([0, 25, 50, 75, 100]);
  });

  it('keeps the last point exact however the shares round', () => {
    const curve = forecastCurve({ standing: 0, plannedByDay: new Map(), medians: [1, 1, 1], tailCents: 100, today: 27 });
    expect(curve[curve.length - 1]).toBe(100);
  });

  it('is just today on the last day of the month', () => {
    expect(forecastCurve({ standing: 42, plannedByDay: new Map(), medians: [], tailCents: 0, today: 30 })).toEqual([42]);
  });
});
