import { partAt, partInMonth } from '../split';

describe('partInMonth', () => {
  const now = new Date(2026, 8, 11, 12).getTime();

  it('is the first part when the spread starts this month', () => {
    expect(partInMonth(1000, 3, new Date(2026, 8, 3).getTime(), now)).toBe(334);
  });

  it('is a later part when it started in an earlier month', () => {
    expect(partInMonth(1000, 3, new Date(2026, 6, 20).getTime(), now)).toBe(333);
  });

  it('is nothing once every part has been and gone', () => {
    expect(partInMonth(1000, 3, new Date(2026, 2, 1).getTime(), now)).toBe(0);
  });

  it('is nothing when the spread has not reached this month yet', () => {
    expect(partInMonth(1000, 3, new Date(2026, 9, 1).getTime(), now)).toBe(0);
  });
});

describe('partAt', () => {
  const bought = new Date(2026, 0, 31, 14, 30).getTime();

  it('keeps the purchase itself where it happened', () => {
    expect(partAt(bought, 0)).toBe(bought);
  });

  it('puts every later part at the start of its month, February included', () => {
    expect([1, 2, 12].map((i) => partAt(bought, i))).toEqual([
      new Date(2026, 1, 1).getTime(),
      new Date(2026, 2, 1).getTime(),
      new Date(2027, 0, 1).getTime(),
    ]);
  });
});
