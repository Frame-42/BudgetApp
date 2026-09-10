import { donutSegments, type DonutShare } from '../Charts';

const shares = (popped = false): DonutShare[] => [
  { alpha: 0.8, percent: 70, totalCents: 700, popped: false },
  { alpha: 0.5, percent: 30, totalCents: 299, popped: false },
  { alpha: 0.2, percent: 0, totalCents: 1, popped },
];

const visibleGap = (
  left: ReturnType<typeof donutSegments>['segments'][number],
  right: ReturnType<typeof donutSegments>['segments'][number],
) => right.start - right.stroke / 2 - (left.end + left.stroke / 2);

describe('donutSegments', () => {
  it('keeps every visible separator equal', () => {
    const result = donutSegments(shares());

    expect(visibleGap(result.segments[0], result.segments[1])).toBeCloseTo(result.gap);
    expect(visibleGap(result.segments[1], result.segments[2])).toBeCloseTo(result.gap);
  });

  it('does not change the shared gap when a tiny slice is selected', () => {
    const resting = donutSegments(shares());
    const selected = donutSegments(shares(true));

    expect(selected.gap).toBe(resting.gap);
    expect(selected.segments[0].stroke).toBe(resting.segments[0].stroke);
    expect(selected.segments[2].stroke).toBeGreaterThan(0);
  });

  it('uses cents rather than rounded display percentages', () => {
    const result = donutSegments(shares());

    expect(result.segments[2].end).toBeGreaterThan(result.segments[2].start);
  });
});
