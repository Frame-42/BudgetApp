import { rubberBand, trendDragOffset, trendSettleDuration, trendSwipeStep } from '../TrendPeriodPager';

describe('Trends swipe intent', () => {
  it('moves right to older periods and left to newer periods', () => {
    expect(trendSwipeStep(100, 100, 0, 300, true, false)).toBe(-1);
    expect(trendSwipeStep(-100, -100, 0, 300, true, false)).toBe(1);
  });

  it('returns a short slow drag to the same period but accepts a deliberate flick', () => {
    expect(trendSwipeStep(30, 30, 0.1, 300, true, false)).toBe(0);
    expect(trendSwipeStep(30, 30, 0.7, 300, true, false)).toBe(-1);
    expect(trendSwipeStep(-30, -30, -0.7, 300, true, false)).toBe(1);
  });

  it('uses the new gesture when continuing before the previous settle finishes', () => {
    // The incoming older page is still left of centre; the new rightward
    // gesture should advance again rather than undo the previous swipe.
    expect(trendSwipeStep(-80, 100, 0, 300, true, true)).toBe(-1);
    expect(trendSwipeStep(80, -100, 0, 300, true, true)).toBe(1);
  });

  it('lets a chained gesture reverse direction and respects the current-month boundary', () => {
    expect(trendSwipeStep(160, -100, 0, 300, true, true)).toBe(1);
    expect(trendSwipeStep(-100, -100, -1, 300, false, true)).toBe(0);
    expect(trendSwipeStep(100, 100, 1, 300, false, true)).toBe(-1);
  });
});

describe('edge rubber-banding', () => {
  it('tracks the finger closely at first and flattens out as the pull grows', () => {
    expect(rubberBand(5, 34)).toBeCloseTo(4.359, 2);
    expect(rubberBand(34, 34)).toBe(17);
    expect(rubberBand(1000, 34)).toBeLessThan(34);
  });

  it('moves freely toward older periods and up to a page away either direction', () => {
    expect(trendDragOffset(-60, 300, true)).toBe(-60);
    expect(trendDragOffset(120, 300, false)).toBe(120);
    expect(trendDragOffset(400, 300, false)).toBe(300);
  });

  it('gives a bounded amount rather than stopping dead at the newest period', () => {
    const pulled = trendDragOffset(-60, 300, false);
    expect(pulled).toBeLessThan(0);
    expect(pulled).toBeGreaterThan(-34);
    expect(pulled).toBeCloseTo(-rubberBand(60, 34), 5);
  });
});

import React from 'react';
import { PanResponder } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { loadTrends } from '../../queries/trends';
import { TrendPeriodPager } from '../TrendPeriodPager';

const { act, create } = require('react-test-renderer');

describe('continuous period gestures', () => {
  it('retains a second swipe released before the first period finishes loading', async () => {
    jest.useFakeTimers();
    const createPan = jest.spyOn(PanResponder, 'create');
    const db = {
      withExclusiveTransactionAsync: async (read: (txn: unknown) => Promise<void>) =>
        read({ getAllAsync: async () => [] }),
    } as unknown as SQLiteDatabase;
    const at = new Date(2026, 8, 10).getTime();
    const initial = (await loadTrends(db, at))[6];
    const older = (await loadTrends(db, at, [], -6))[6];
    const change = jest.fn();
    const props = { selectedKey: null, onPick: jest.fn(), onChangePeriod: change };
    let tree: ReturnType<typeof create>;
    try {
      await act(async () => { tree = create(React.createElement(TrendPeriodPager, { ...props, data: initial })); });
      await act(async () => {
        tree.root.findAll((node: { props: { onLayout?: unknown } }) => !!node.props.onLayout)[0].props.onLayout({ nativeEvent: { layout: { width: 300 } } });
      });
      const pan = createPan.mock.calls[createPan.mock.calls.length - 1][0];
      const gesture = { dx: 110, dy: 0, vx: 0.7 } as Parameters<NonNullable<typeof pan.onPanResponderRelease>>[1];
      const event = {} as Parameters<NonNullable<typeof pan.onPanResponderRelease>>[0];
      const swipe = async () => act(async () => {
        pan.onPanResponderGrant?.(event, gesture);
        pan.onPanResponderMove?.(event, gesture);
        pan.onPanResponderRelease?.(event, gesture);
      });
      await swipe();
      expect(change.mock.calls).toEqual([[-6]]);
      await swipe();
      expect(change.mock.calls).toEqual([[-6]]);
      await act(async () => { tree.update(React.createElement(TrendPeriodPager, { ...props, data: older })); });
      expect(change.mock.calls).toEqual([[-6], [-12]]);
    } finally {
      await act(async () => { tree?.unmount(); });
      createPan.mockRestore();
      jest.useRealTimers();
    }
  });

  it('does not change period when a swipe toward newer bounces off the newest one', async () => {
    const createPan = jest.spyOn(PanResponder, 'create');
    const db = {
      withExclusiveTransactionAsync: async (read: (txn: unknown) => Promise<void>) =>
        read({ getAllAsync: async () => [] }),
    } as unknown as SQLiteDatabase;
    const at = new Date(2026, 8, 10).getTime();
    const newest = (await loadTrends(db, at))[6];
    expect(newest.newer).toBeNull();
    const change = jest.fn();
    const props = { selectedKey: null, onPick: jest.fn(), onChangePeriod: change, data: newest };
    let tree: ReturnType<typeof create>;
    try {
      await act(async () => { tree = create(React.createElement(TrendPeriodPager, props)); });
      await act(async () => {
        tree.root.findAll((node: { props: { onLayout?: unknown } }) => !!node.props.onLayout)[0].props.onLayout({ nativeEvent: { layout: { width: 300 } } });
      });
      const pan = createPan.mock.calls[createPan.mock.calls.length - 1][0];
      const event = {} as Parameters<NonNullable<typeof pan.onPanResponderRelease>>[0];
      const gesture = { dx: -80, dy: 0, vx: -0.9 } as Parameters<NonNullable<typeof pan.onPanResponderRelease>>[1];
      await act(async () => {
        pan.onPanResponderGrant?.(event, { dx: 0, dy: 0, vx: 0 } as typeof gesture);
        pan.onPanResponderMove?.(event, gesture);
        pan.onPanResponderRelease?.(event, gesture);
      });
      expect(change).not.toHaveBeenCalled();
    } finally {
      await act(async () => { tree?.unmount(); });
      createPan.mockRestore();
    }
  });
});


describe('swipe settling speed', () => {
  it('follows release speed within the bounds', () => {
    expect(trendSettleDuration(180, 1)).toBe(360);
    expect(trendSettleDuration(180, 1.5)).toBe(240);
    expect(trendSettleDuration(180, 3)).toBe(120);
  });

  it('caps slow and fast releases in both directions', () => {
    expect(trendSettleDuration(250, 0)).toBe(360);
    expect(trendSettleDuration(180, 100)).toBe(120);
    expect(trendSettleDuration(-180, -1.5)).toBe(240);
  });

  it('accounts for remaining distance and skips settling when already aligned', () => {
    expect(trendSettleDuration(120, 1)).toBe(240);
    expect(trendSettleDuration(60, 1)).toBe(120);
    expect(trendSettleDuration(0, 1)).toBe(0);
  });
});
