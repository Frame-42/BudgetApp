import { stepMonthWithinBounds } from '../time';

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
