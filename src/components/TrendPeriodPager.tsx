import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import type { TrendsBundle, TrendSpan } from '../queries/trends';
import { euroLabel } from '../format';
import { isHorizontalSwipe } from '../motion';
import { makeStyles, useTheme } from '../theme';
import { T } from './primitives';

/** Quadratic ease-out starts at twice its average speed; vx is points per ms. */
export function trendSettleDuration(distance: number, vx: number): number {
  if (Math.abs(distance) < 0.5) return 0;
  const speed = Math.max(0.45, Math.abs(vx));
  return Math.round(Math.max(120, Math.min(360, 2 * Math.abs(distance) / speed)));
}

/** How far a drag past the newest period is allowed to pull before resistance caps it. */
const EDGE_PULL_LIMIT = 34;

/** iOS-style rubber-banding: a drag past an edge slows to a soft stop instead of a hard wall. */
export function rubberBand(overflow: number, limit: number): number {
  return (overflow * limit) / (overflow + limit);
}

/**
 * The strip's raw offset for a drag. There's always an older period to reveal,
 * but the newest one has no further page — pulling past it gives a little,
 * rubber-banded, rather than stopping dead against a wall.
 */
export function trendDragOffset(distance: number, stride: number, canNewer: boolean): number {
  const upper = Math.min(stride, distance);
  return !canNewer && upper < 0 ? -rubberBand(-upper, EDGE_PULL_LIMIT) : upper;
}

/** A fresh gesture can advance from the incoming period before it has settled. */
export function trendSwipeStep(distance: number, dx: number, vx: number, stride: number, canNewer: boolean, chained: boolean): number {
  const intent = chained ? dx : distance;
  const step = intent > 0 ? -1 : 1;
  const commit = Math.abs(intent) > stride * 0.25 ||
    (Math.abs(dx) > 10 && Math.abs(vx) > 0.5 && dx * vx > 0);
  return commit && (step === -1 || canNewer) ? step : 0;
}

/** Adjacent periods follow the finger; the short settle is always interruptible. */
export function TrendPeriodPager({ data, selectedKey, onPick, onChangePeriod }: {
  data: TrendsBundle[TrendSpan];
  selectedKey: string | null;
  onPick: (key: string) => void;
  onChangePeriod: (offset: number) => void;
}) {
  const styles = useStyles();
  const { color, w } = useTheme();
  const offset = useRef(new Animated.Value(0)).current;
  const position = useRef(0);
  const dragStart = useRef(0);
  const dragging = useRef(false);
  const settling = useRef(false);
  const chained = useRef(false);
  const requested = useRef<number | null>(null);
  const queuedRelease = useRef<{ dx: number; vx: number } | null>(null);
  const [width, setWidth] = useState(0);
  const barGap = data.span === 12 ? 4 : 9;
  const pageStride = width + barGap;
  const [frame, setFrame] = useState({ endOffset: data.endOffset, span: data.span, stride: pageStride, base: 0 });
  if (frame.endOffset !== data.endOffset || frame.span !== data.span || frame.stride !== pageStride) {
    setFrame({
      endOffset: data.endOffset, span: data.span, stride: pageStride,
      base: frame.span === data.span && frame.stride === pageStride
        ? frame.base + Math.sign(data.endOffset - frame.endOffset) * pageStride
        : -position.current,
    });
  }
  const base = frame.base;
  const pages = [data.older, data, ...(data.newer ? [data.newer] : [])];
  const latest = useRef({ data, pageStride, width, base, onChangePeriod });
  latest.current = { data, pageStride, width, base, onChangePeriod };

  useEffect(() => {
    // useNativeDriver means stopAnimation's own callback only resolves after a
    // bridge round trip, too late to read a mid-flight position synchronously
    // when a new gesture interrupts it. The listener keeps position.current
    // current on every frame instead.
    const id = offset.addListener(({ value }) => { position.current = value; });
    return () => { offset.removeListener(id); offset.stopAnimation(); };
  }, [offset]);

  const move = useCallback((value: number) => {
    position.current = value;
    offset.setValue(value);
  }, [offset]);

  const settle = useCallback((toValue: number, duration = trendSettleDuration(toValue - position.current, 0), onFinish?: () => void) => {
    settling.current = true;
    // Ease-out only: the strip loses speed throughout, with no spring acceleration.
    Animated.timing(offset, {
      toValue, duration, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        position.current = toValue;
        settling.current = false;
        onFinish?.();
      }
    });
  }, [offset]);

  const release = useCallback((dx: number, vx: number) => {
    // A very fast second swipe can finish before SQLite returns. Keep its intent
    // and apply it to the incoming period, rather than dropping the gesture.
    if (requested.current !== null) {
      queuedRelease.current = { dx, vx };
      return;
    }
    const { data: current, pageStride: stride, base: origin, onChangePeriod: change } = latest.current;
    const step = trendSwipeStep(dragStart.current + dx + origin, dx, vx, stride, !!current.newer, chained.current);
    const next = step < 0 ? current.older : current.newer;
    if (step && next) {
      // Fire the query immediately, in parallel with the settle animation — an
      // interrupting gesture stops that animation before its finish callback
      // ever runs, so the request can't wait on it.
      requested.current = next.endOffset;
      change(next.endOffset);
      const target = -step * stride - origin;
      // Keep the current strip intact while the native animation runs. Loading
      // and replacing the screen mid-flight used to hitch and restart the glide.
      settle(target, trendSettleDuration(target - position.current, vx));
    } else settle(-origin, trendSettleDuration(position.current + origin, vx));
  }, [settle]);

  const previous = useRef({ data, pageStride });
  useLayoutEffect(() => {
    const prior = previous.current;
    previous.current = { data, pageStride };
    if (prior.data === data && prior.pageStride === pageStride) return;
    if (prior.data.span === data.span && prior.pageStride === pageStride && requested.current === data.endOffset) {
      // The React layout carries the new origin in the same commit as the new
      // bars. Leave the native transform alone: resetting it here caused a blank frame.
      requested.current = null;
      const queued = queuedRelease.current;
      queuedRelease.current = null;
      if (queued) release(queued.dx, queued.vx);
      return;
    }
    if (prior.data.span !== data.span || prior.pageStride !== pageStride || requested.current !== null || prior.data.endOffset !== data.endOffset) {
      offset.stopAnimation();
      setFrame((current) => ({ ...current, base: -position.current }));
      requested.current = null;
      queuedRelease.current = null;
      dragStart.current = 0;
      dragging.current = false;
      settling.current = false;
    }
  }, [data, pageStride, move, offset, release, settle]);

  const panConfig = useMemo<Parameters<typeof PanResponder.create>[0]>(() => ({
    onMoveShouldSetPanResponderCapture: (_, g) => latest.current.width > 0 && isHorizontalSwipe(g.dx, g.dy),
    onPanResponderGrant: () => {
      chained.current = settling.current || requested.current !== null;
      dragging.current = true;
      settling.current = false;
      queuedRelease.current = null;
      // position.current is already current via the listener, so an interrupted
      // glide continues from exactly where the finger caught it.
      offset.stopAnimation();
      dragStart.current = position.current;
    },
    onPanResponderMove: (_, g) => {
      const { data: current, pageStride: stride, base: origin } = latest.current;
      const distance = dragStart.current + g.dx + origin;
      move(trendDragOffset(distance, stride, !!current.newer) - origin);
    },
    onPanResponderRelease: (_, g) => {
      dragging.current = false;
      release(g.dx, g.vx);
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => {
      dragging.current = false;
      queuedRelease.current = null;
      const { data: current, pageStride: stride, base: origin } = latest.current;
      settle((requested.current === null ? 0 : -Math.sign(requested.current - current.endOffset) * stride) - origin);
    },
  }), [move, offset, release, settle]);
  const pan = useMemo(() => PanResponder.create(panConfig), [panConfig]);

  return (
    <View {...pan.panHandlers} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.viewport}>
      {width > 0 ? (
        <Animated.View style={[styles.content, {
          width: pages.length * pageStride - barGap,
          left: -pageStride + base,
          columnGap: barGap,
          transform: [{ translateX: offset }],
        }]}>
          {pages.map((page, index) => {
            const current = index === 1;
            const dense = page.span === 12;
            const picked = current && page.months.some((month) => month.key === selectedKey);
            return (
              <View key={index} style={{ width }} accessibilityElementsHidden={!current} importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}>
                <View style={[styles.row, { gap: barGap }]}>
                  {page.months.map((month) => {
                    const on = current && month.key === selectedKey;
                    const missing = !month.present;
                    return (
                      <Pressable
                        key={month.key}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on, disabled: missing || !current }}
                        accessibilityLabel={`${month.label} ${month.key.slice(0, 4)}, ${missing ? 'nothing recorded' : euroLabel(month.totalCents)}`}
                        accessibilityHint="Shows this month on its own"
                        disabled={missing || !current}
                        onPress={() => { if (!dragging.current && !settling.current && requested.current === null) onPick(month.key); }}
                        style={[styles.column, dense && { gap: 7 }]}
                      >
                        <View style={[styles.bar, {
                          height: Math.max(6, month.fraction * 78),
                          backgroundColor: missing ? w(0.04) : on ? color.mark : picked ? w(0.08) : w(0.12),
                        }]} />
                        <T weight="mono" size={dense ? 9 : 10} alpha={missing ? 0.16 : on ? 0.62 : picked ? 0.24 : 0.3}>
                          {dense ? month.label.charAt(0) : month.label}
                        </T>
                      </Pressable>
                    );
                  })}
                </View>

              </View>
            );
          })}
        </Animated.View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  // Keep the original baseline while admitting the tallest bar's 4pt overhang.
  viewport: { height: 100, marginTop: -4, overflow: 'hidden' },
  content: { paddingTop: 4, flexDirection: 'row' },
  row: { flexDirection: 'row', alignItems: 'flex-end', height: 96 },
  column: { flex: 1, alignItems: 'center', gap: 9 },
  bar: { width: '100%', borderRadius: 5 },
}));
