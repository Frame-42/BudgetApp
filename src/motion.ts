import { LayoutAnimation } from 'react-native';

/**
 * The same 280ms ease the tab bar uses. Anything that changes a layout in place
 * — a sheet stepping forward, a chip row expanding — runs through this, so the
 * app has one movement rather than several near-identical ones. A dismissal may
 * pass a shorter `duration`: going back should be quicker than arriving.
 */
export const morph = (duration = 280) =>
  LayoutAnimation.configureNext({
    duration,
    create: { type: 'easeInEaseOut', property: 'opacity' },
    update: { type: 'easeInEaseOut' },
    delete: { type: 'easeInEaseOut', property: 'opacity' },
  });

/**
 * Beyond this much horizontal drag there's no real ambiguity left — the thumb
 * is clearly dragging sideways, not scrolling — so the angle check below opens
 * up a lot rather than still weighing dx against dy almost evenly.
 */
const SWIPE_COMMIT_DISTANCE = 18;

/**
 * Whether a gesture should be claimed as a horizontal swipe rather than left to
 * a vertical scroll. A real thumb rarely tracks perfectly horizontal, so early
 * on dx only has to lead dy — not dwarf it — before we commit; that reads as up
 * to about 45° off horizontal. Once the drag is clearly under way the tolerance
 * widens a lot further, so a swipe already in progress isn't cancelled by
 * ordinary vertical drift. Both the Trends period pager and Spend's month
 * selector swipe through this, so the two feel the same and the tuning lives
 * in one place.
 */
export function isHorizontalSwipe(dx: number, dy: number, minDistance = 6): boolean {
  const distance = Math.abs(dx);
  if (distance <= minDistance) return false;
  const lead = distance > SWIPE_COMMIT_DISTANCE ? 0.3 : 1;
  return distance > Math.abs(dy) * lead;
}
