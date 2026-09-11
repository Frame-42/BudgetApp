import { isHorizontalSwipe } from '../motion';

describe('isHorizontalSwipe', () => {
  it('claims a perfectly horizontal drag', () => {
    expect(isHorizontalSwipe(50, 0)).toBe(true);
  });

  it('tolerates roughly 45 degrees off horizontal early in the gesture', () => {
    expect(isHorizontalSwipe(15, 12)).toBe(true);
    expect(isHorizontalSwipe(-15, -12)).toBe(true);
    expect(isHorizontalSwipe(15, -12)).toBe(true);
    expect(isHorizontalSwipe(12, 15)).toBe(false);
  });

  it('widens a lot once the drag is clearly under way', () => {
    expect(isHorizontalSwipe(25, 60)).toBe(true);
    expect(isHorizontalSwipe(50, 40)).toBe(true);
  });

  it('still leaves a mostly vertical drag to scrolling even once committed', () => {
    expect(isHorizontalSwipe(20, 100)).toBe(false);
    expect(isHorizontalSwipe(0, 50)).toBe(false);
  });

  it('ignores a drag too short to have a clear direction yet', () => {
    expect(isHorizontalSwipe(4, 0)).toBe(false);
  });
});
