import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { T } from './primitives';
import { CaretIcon } from './Icons';
import { tapSelect } from '../haptics';
import { isHorizontalSwipe } from '../motion';
import { addMonths, MONTH_ABBR } from '../time';
import { color, fg, radius, w } from '../theme';

/** 'SEP 2026' — a month as the stepper names it. */
export const monthLabel = (ts: number) => {
  const d = new Date(ts);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
};

/** Adjacent labels travel with the finger before the selected month changes. */
function SwipeLabel({ label, month, canStepBack, canStepForward, onStep, onPress, swiping, onSwipingChange }: {
  label: string;
  month: number | null;
  canStepBack: boolean;
  canStepForward: boolean;
  onStep: (delta: number) => void;
  onPress: () => void;
  swiping: boolean;
  onSwipingChange: (swiping: boolean) => void;
}) {
  const offset = useRef(new Animated.Value(0)).current;
  const settling = useRef(false);
  const dragStart = useRef(0);
  const pendingMonth = useRef<number | null>(null);
  const continuation = useRef<{ month: number; offset: number } | null>(null);
  const chained = useRef(false);
  const [width, setWidth] = useState(0);
  const pageWidth = width + 2 * (26 + 4);
  const settle = useCallback((toValue: number, velocity = 0) => Animated.spring(offset, {
    toValue, velocity, stiffness: 280, damping: 32, mass: 0.8,
    overshootClamping: true, restDisplacementThreshold: 0.1, restSpeedThreshold: 0.1,
    useNativeDriver: false,
  }), [offset]);
  useLayoutEffect(() => {
    const carried = continuation.current;
    continuation.current = null;
    if (month !== null && carried?.month === month) {
      offset.setValue(carried.offset);
      return;
    }
    offset.stopAnimation();
    offset.setValue(0);
    dragStart.current = 0;
    settling.current = false;
    pendingMonth.current = null;
    onSwipingChange(false);
  }, [month, label, offset, onSwipingChange]);
  useEffect(() => () => {
    offset.stopAnimation();
    onSwipingChange(false);
  }, [offset, onSwipingChange]);

  const latest = useRef({ month, canStepBack, canStepForward, width: pageWidth, onStep });
  latest.current = { month, canStepBack, canStepForward, width: pageWidth, onStep };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) =>
      latest.current.month !== null && latest.current.width > 0 && isHorizontalSwipe(g.dx, g.dy),
    onPanResponderGrant: () => {
      const delta = pendingMonth.current;
      pendingMonth.current = null;
      chained.current = delta !== null;
      offset.stopAnimation((value) => {
        const { month, width, onStep } = latest.current;
        if (delta !== null && month !== null) {
          // Rebase around the incoming month without moving any visible letters.
          // The next gesture can now advance beyond it before the spring rests.
          const rebased = value + delta * width;
          dragStart.current = rebased;
          continuation.current = { month: addMonths(month, delta), offset: rebased };
          onStep(delta);
          tapSelect();
        } else dragStart.current = value;
      });
      settling.current = false;
      onSwipingChange(true);
    },
    onPanResponderMove: (_, g) => {
      const { canStepBack, canStepForward, width } = latest.current;
      const distance = dragStart.current + g.dx;
      const allowed = distance > 0 ? canStepBack : canStepForward;
      offset.setValue(allowed ? Math.max(-width, Math.min(width, distance)) : Math.sign(distance) * 12 * (1 - Math.exp(-Math.abs(distance) / 100)));
    },
    onPanResponderRelease: (_, g) => {
      const { canStepBack, canStepForward, width, onStep } = latest.current;
      const distance = dragStart.current + g.dx;
      const intent = chained.current ? g.dx : distance;
      const delta = intent > 0 ? -1 : 1;
      const allowed = delta === -1 ? canStepBack : canStepForward;
      const commit = allowed && (Math.abs(intent) > width * 0.3 || (Math.abs(g.dx) > 10 && Math.abs(g.vx) > 0.5 && g.dx * g.vx > 0));
      pendingMonth.current = commit ? delta : null;
      settling.current = true;
      const velocity = Math.abs(distance) >= width ? 0 : Math.max(-1200, Math.min(1200, g.vx * 1000));
      settle(commit ? -delta * width : 0, velocity).start(({ finished }) => {
        if (!finished) return;
        pendingMonth.current = null;
        if (commit) {
          tapSelect();
          onStep(delta);
        } else {
          settling.current = false;
          onSwipingChange(false);
        }
      });
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => {
      pendingMonth.current = null;
      settling.current = true;
      settle(0).start(({ finished }) => {
        if (!finished) return;
        settling.current = false;
        onSwipingChange(false);
      });
    },
  }), [offset, settle, onSwipingChange]);

  const swipeable = month !== null;

  return (
    <View {...pan.panHandlers} style={swipeable ? { overflow: swiping ? 'visible' : 'hidden' } : undefined}>
      <Pressable accessibilityRole="button"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessibilityLabel={`Showing ${label}. Opens the period choices.`}
        accessibilityHint={swipeable ? 'Swipe left or right to change month.' : undefined}
        onPress={() => { if (!settling.current) onPress(); }}
        style={({ pressed }) => [styles.label, !swipeable && pressed && styles.pressed]}>
        <T weight="monoMedium" size={10.5} tracking={0.06} alpha={0.62}
          style={swipeable && width > 0 ? { opacity: 0 } : undefined}>
          {label.toUpperCase()}
        </T>
        {month !== null && width > 0 ? (
          <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', top: 0, bottom: 0, alignItems: 'center', left: -pageWidth - (pageWidth - width) / 2, width: pageWidth * 3, flexDirection: 'row', transform: [{ translateX: offset }] }}>
            {[-1, 0, 1].map((delta) => (
              <View key={delta} style={{ width: pageWidth, alignItems: 'center' }}>
                <T weight="monoMedium" size={10.5} tracking={0.06} alpha={0.62}>
                  {(delta === -1 && !canStepBack) || (delta === 1 && !canStepForward) ? '' : monthLabel(addMonths(month, delta)).toUpperCase()}
                </T>
              </View>
            ))}
          </Animated.View>
        ) : null}
      </Pressable>
    </View>
  );
}

function Step({
  direction,
  enabled,
  hidden = false,
  onPress,
}: {
  direction: 'back' | 'forward';
  enabled: boolean;
  hidden?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction === 'back' ? 'Previous month' : 'Next month'}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled || hidden}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      onPress={() => {
        tapSelect();
        onPress();
      }}
      style={({ pressed }) => [styles.step, pressed && styles.pressed, hidden && { opacity: 0 }]}
    >
      {/* The app's one caret points down; turn it onto its side. */}
      <View style={{ transform: [{ rotate: direction === 'back' ? '90deg' : '-90deg' }] }}>
        <CaretIcon color={fg(enabled ? 0.55 : 0.18)} size={15} />
      </View>
    </Pressable>
  );
}

/**
 * The month control: a caret either side, a label that swipes through months
 * with its neighbours travelling under the finger, and a tap on the label for
 * whatever choices the caller opens onto. Spend's period pill and the Add
 * screen's day picker are both this, so stepping through months feels the same
 * wherever it happens.
 *
 * Renders the pill's contents, not the pill: Spend morphs the same pill into its
 * choices, so the frame belongs to the caller.
 */
export function MonthStepper({
  label,
  month,
  canStepBack,
  canStepForward,
  onStep,
  onPress,
}: {
  /** What the pill says; `monthLabel(month)` when it is showing a month. */
  label: string;
  /** The start of the month in view, or null when the pill shows something
      that isn't one month (a range, all time) and so doesn't swipe. */
  month: number | null;
  canStepBack: boolean;
  canStepForward: boolean;
  onStep: (delta: number) => void;
  onPress: () => void;
}) {
  const [swiping, setSwiping] = useState(false);
  /* The carets fade out while the labels travel, and come back a beat after
     they settle rather than flickering between chained swipes. */
  const caretTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSwipingChange = useCallback((active: boolean) => {
    if (caretTimer.current) clearTimeout(caretTimer.current);
    if (active) setSwiping(true);
    else caretTimer.current = setTimeout(() => setSwiping(false), 220);
  }, []);
  useEffect(() => () => {
    if (caretTimer.current) clearTimeout(caretTimer.current);
  }, []);

  return (
    <>
      <Step direction="back" hidden={swiping} enabled={canStepBack} onPress={() => onStep(-1)} />
      <SwipeLabel
        label={label}
        month={month}
        canStepBack={canStepBack}
        canStepForward={canStepForward}
        onStep={onStep}
        onPress={onPress}
        swiping={swiping}
        onSwipingChange={handleSwipingChange}
      />
      <Step direction="forward" hidden={swiping} enabled={canStepForward} onPress={() => onStep(1)} />
    </>
  );
}

/** One of the choices the pill opens onto when its label is tapped. */
export function Choice({
  label,
  on,
  alpha = 0.62,
  onPress,
}: {
  label: string;
  on?: boolean;
  alpha?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        tapSelect();
        onPress();
      }}
      style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && styles.pressed]}
    >
      <T
        weight="monoMedium"
        size={10.5}
        tracking={0.06}
        alpha={on ? undefined : alpha}
        style={on ? { color: color.ink } : undefined}
      >
        {label.toUpperCase()}
      </T>
    </Pressable>
  );
}

/** The frame around the stepper, and its wider shape once it opens onto choices. */
export const pillStyles = StyleSheet.create({
  pill: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 32,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: w(0.05),
    borderWidth: 1,
    borderColor: w(0.07),
  },
  open: { flex: 1, paddingHorizontal: 6 },
});

const styles = StyleSheet.create({
  step: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  label: { paddingHorizontal: 6, height: 26, justifyContent: 'center' },
  choice: { paddingHorizontal: 12, height: 26, borderRadius: radius.pill, justifyContent: 'center' },
  choiceOn: { backgroundColor: color.textStrong },
});
