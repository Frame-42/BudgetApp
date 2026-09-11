import {
  calendarCells,
  dueOccurrences,
  occurrenceAt,
  occurrenceIndex,
  onDay,
  stepMonthWithinBounds,
} from '../time';

describe('stepMonthWithinBounds', () => {
  const june = new Date(2026, 5, 1).getTime();
  const august = new Date(2026, 7, 1).getTime();
  const september = new Date(2026, 8, 10).getTime();

  it('advances toward the current month', () => {
    expect(stepMonthWithinBounds(august, 1, june, september)).toBe(
      new Date(2026, 8, 1).getTime(),
    );
  });

  it('does not advance past the current month', () => {
    const current = new Date(2026, 8, 1).getTime();
    expect(stepMonthWithinBounds(current, 1, june, september)).toBe(current);
  });

  it('does not step before the earliest transaction', () => {
    expect(stepMonthWithinBounds(june, -1, june, september)).toBe(june);
  });

  it('does not step backward when there is no history', () => {
    expect(stepMonthWithinBounds(august, -1, null, september)).toBe(august);
  });
});

describe('occurrenceAt', () => {
  it('measures every month from the anchor, so a short month does not stick', () => {
    const jan31 = new Date(2026, 0, 31, 9, 30).getTime();
    expect(new Date(occurrenceAt(jan31, 'month', 1))).toEqual(new Date(2026, 1, 28, 9, 30));
    expect(new Date(occurrenceAt(jan31, 'month', 2))).toEqual(new Date(2026, 2, 31, 9, 30));
  });

  it('clamps a leap day in the years without one', () => {
    const leap = new Date(2028, 1, 29).getTime();
    expect(new Date(occurrenceAt(leap, 'year', 1))).toEqual(new Date(2029, 1, 28));
    expect(new Date(occurrenceAt(leap, 'year', 4))).toEqual(new Date(2032, 1, 29));
  });

  it('keeps the time of day across weeks', () => {
    const monday = new Date(2026, 2, 23, 9, 0).getTime();
    expect(new Date(occurrenceAt(monday, 'week', 2))).toEqual(new Date(2026, 3, 6, 9, 0));
  });
});

describe('occurrenceIndex', () => {
  it('inverts occurrenceAt for every cadence', () => {
    const anchor = new Date(2026, 0, 31, 8, 15).getTime();
    for (const cadence of ['week', 'month', 'year'] as const) {
      for (const k of [0, 1, 5, 13, 60]) {
        expect(occurrenceIndex(anchor, cadence, occurrenceAt(anchor, cadence, k))).toBe(k);
      }
    }
  });
});

describe('dueOccurrences', () => {
  const anchor = new Date(2026, 5, 15).getTime();

  it('books nothing before the next date', () => {
    const next = occurrenceAt(anchor, 'month', 1);
    expect(dueOccurrences(anchor, 'month', next, next - 1)).toEqual({ due: [], next });
  });

  it('catches up every missed occurrence and points past them', () => {
    const next = occurrenceAt(anchor, 'month', 1);
    const at = new Date(2026, 8, 20).getTime();
    expect(dueOccurrences(anchor, 'month', next, at)).toEqual({
      due: [1, 2, 3].map((k) => occurrenceAt(anchor, 'month', k)),
      next: occurrenceAt(anchor, 'month', 4),
    });
  });

  it('counts an occurrence due at this very moment', () => {
    const next = occurrenceAt(anchor, 'week', 1);
    expect(dueOccurrences(anchor, 'week', next, next).due).toEqual([next]);
  });

  it('stops at the limit and leaves the rest due', () => {
    const at = new Date(2030, 0, 1).getTime();
    const { due, next } = dueOccurrences(anchor, 'week', anchor, at, 3);
    expect(due).toHaveLength(3);
    expect(next).toBe(occurrenceAt(anchor, 'week', 3));
  });
});

describe('calendarCells', () => {
  it('leads with blanks up to the first weekday, Monday-first', () => {
    // 1 Sep 2026 is a Tuesday: one blank for Monday.
    const cells = calendarCells(new Date(2026, 8, 17));
    expect(cells[0]).toBeNull();
    expect(cells[1]).toBe(new Date(2026, 8, 1).getTime());
    expect(cells).toHaveLength(1 + 30);
  });

  it('puts a Sunday the 1st in the last column', () => {
    // 1 Feb 2026 is a Sunday.
    const cells = calendarCells(new Date(2026, 1, 1));
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(cells[6]).toBe(new Date(2026, 1, 1).getTime());
  });

  it('ends on the last day of the month', () => {
    const cells = calendarCells(new Date(2028, 1, 1));
    expect(cells[cells.length - 1]).toBe(new Date(2028, 1, 29).getTime());
  });
});

describe('onDay', () => {
  it('keeps the day and takes the time of day from the reference', () => {
    const day = new Date(2026, 7, 3).getTime();
    const at = new Date(2026, 8, 11, 14, 23, 7, 120).getTime();
    expect(onDay(day, at)).toBe(new Date(2026, 7, 3, 14, 23, 7, 120).getTime());
  });
});
