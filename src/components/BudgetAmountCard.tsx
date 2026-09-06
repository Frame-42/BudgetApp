import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Amount, Eyebrow, HeroCard, T, TextField } from './primitives';
import { tapSelect } from '../haptics';
import { euroLabel, figure } from '../format';
import { morph } from '../motion';
import { color, fg, radius, w } from '../theme';

/* The canvas's slider: 1,500–5,000 in steps of 50, opening at 3,200 — which is
   also what the seven seeded category limits add up to. */
export const MIN_CENTS = 150_000;
export const MAX_CENTS = 500_000;
export const STEP_CENTS = 5_000;
export const DEFAULT_CENTS = 320_000;

/* Typing a figure exists to escape the rail, so it takes far more than the rail
   spans; the knob simply pins to whichever end the value has run past. */
export const TYPED_MIN_CENTS = 10_000;
export const TYPED_MAX_CENTS = 99_999_900;

/**
 * Floor between two ticks of the drag haptic. The rail is 70 steps wide, so a
 * brisk swipe crosses a step every few milliseconds, and one selection haptic
 * per step queues them faster than the taptic engine plays them — which is what
 * made the drag feel like it was catching. The value still moves on every step;
 * only the feedback is thinned.
 */
const HAPTIC_GAP_MS = 55;

export const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** Digits only, and never wider than the fields here are drawn for. */
export const digits = (text: string) => text.replace(/[^0-9]/g, '').slice(0, 6);

/** Marks the "type it in" escape as an action rather than a value. */
function Pencil() {
  return (
    <Svg width={12} height={12} viewBox="0 0 14 14" fill="none">
      <Path
        d="M9.4 2.1 11.9 4.6M2.4 11.6l.4-2.1 6.1-6.1 2.5 2.5-6.1 6.1-2.9.4Z"
        stroke={fg(0.62)}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * The overall monthly budget: a rail for the common case, a keyboard for the
 * rest. Onboarding's step 2 and the budget editor are the same control, so it
 * lives here rather than in either screen.
 *
 * The typed figure is pushed on every keystroke rather than on a commit, which
 * is what lets both callers drop it from their own navigation: there is never an
 * uncommitted value to lose. `typing` is display state only, and it resets by
 * unmounting — both callers render this conditionally.
 */
export function BudgetAmountCard({
  valueCents,
  onChange,
  label = 'Monthly budget',
}: {
  valueCents: number;
  onChange: (cents: number) => void;
  label?: string;
}) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [trackWidth, setTrackWidth] = useState(0);
  const lastTick = useRef(0);

  const fraction = clamp((valueCents - MIN_CENTS) / (MAX_CENTS - MIN_CENTS), 0, 1);

  const openTyping = () => {
    tapSelect();
    morph();
    setDraft(String(Math.round(valueCents / 100)));
    setTyping(true);
  };

  const type = (text: string) => {
    const next = digits(text);
    setDraft(next);
    const euros = Number.parseInt(next, 10);
    if (Number.isFinite(euros)) onChange(clamp(euros * 100, TYPED_MIN_CENTS, TYPED_MAX_CENTS));
  };

  /** Drag anywhere on the rail; the value snaps to the canvas's 50-unit step. */
  const setFromTouch = (x: number) => {
    if (trackWidth <= 0) return;
    const ratio = clamp(x / trackWidth, 0, 1);
    const snapped =
      Math.round((MIN_CENTS + ratio * (MAX_CENTS - MIN_CENTS)) / STEP_CENTS) * STEP_CENTS;
    if (snapped === valueCents) return;
    const at = Date.now();
    if (at - lastTick.current >= HAPTIC_GAP_MS) {
      lastTick.current = at;
      tapSelect();
    }
    onChange(snapped);
  };

  return (
    <HeroCard style={styles.budgetCard}>
      <Eyebrow alpha={0.34}>{label}</Eyebrow>

      {typing ? (
        <View style={styles.typeRow}>
          <TextField
            value={draft}
            onChangeText={type}
            keyboardType="number-pad"
            autoFocus
            selectTextOnFocus
            onBlur={() => setTyping(false)}
            onSubmitEditing={() => setTyping(false)}
            accessibilityLabel="Monthly budget in euros"
            placeholder="0"
            weight="light"
            size={50}
            lineHeight={50 * 1.15}
            tracking={-0.035}
            style={styles.typeInput}
          />
          <T weight="light" size={24} lineHeight={24 * 1.15} alpha={0.42}>
            €
          </T>
        </View>
      ) : (
        /* The figure itself is the largest target on the card, so it opens
           the keyboard too — the pill below is what says so. */
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Type a different monthly budget"
          onPress={openTyping}
        >
          <Amount value={figure(valueCents)} size={50} symbolSize={24} />
        </Pressable>
      )}

      <View
        style={[styles.sliderBlock, typing && styles.sliderIdle]}
        /* A drag while the field is open would fight the draft figure. */
        pointerEvents={typing ? 'none' : 'auto'}
      >
        <View
          style={styles.sliderRow}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          /* The ScrollView asks for the touch the moment the finger moves;
             handing it over mid-drag is what made the knob let go. */
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => setFromTouch(e.nativeEvent.locationX)}
          onResponderMove={(e) => setFromTouch(e.nativeEvent.locationX)}
        >
          {/* locationX is measured against whichever view the finger landed
              on, so the rail's own parts have to be invisible to touches —
              grabbing the knob otherwise reported ~8px and threw the value
              to the minimum before the drag had begun. */}
          <View pointerEvents="none" style={styles.track} />
          <View pointerEvents="none" style={[styles.trackFill, { width: `${fraction * 100}%` }]} />
          <View pointerEvents="none" style={[styles.knob, { left: `${fraction * 100}%` }]} />
        </View>
        <View style={styles.rowBetween}>
          <T weight="mono" size={10} alpha={0.28}>
            {euroLabel(MIN_CENTS)}
          </T>
          <T weight="mono" size={10} alpha={0.28}>
            {euroLabel(MAX_CENTS)}
          </T>
        </View>
      </View>

      {typing ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setTyping(false)}
          style={({ pressed }) => [styles.typeDone, pressed && { opacity: 0.85 }]}
        >
          <T weight="medium" size={12.5} style={{ color: color.ink }}>
            Done
          </T>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Type a different monthly budget"
          onPress={openTyping}
          hitSlop={10}
          style={({ pressed }) => [styles.typeHint, pressed && { opacity: 0.7 }]}
        >
          <Pencil />
          <T size={12} alpha={0.62}>
            Different budget? Type it in
          </T>
        </Pressable>
      )}
    </HeroCard>
  );
}

const styles = StyleSheet.create({
  budgetCard: { paddingVertical: 26, paddingHorizontal: 24, gap: 20, alignItems: 'center' },
  typeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  typeInput: { minWidth: 130, textAlign: 'center', color: color.textBright },
  typeDone: {
    height: 34,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    backgroundColor: color.textStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Dashed, like the "More" chip: unfilled reads as a control rather than a value. */
  typeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 34,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: w(0.16),
    borderStyle: 'dashed',
  },
  sliderBlock: { width: '100%', gap: 12 },
  sliderIdle: { opacity: 0.35 },
  /* Taller than the rail it draws: 3px of track is not a thumb-sized target. */
  sliderRow: { height: 34, justifyContent: 'center' },
  track: { width: '100%', height: 3, borderRadius: 2, backgroundColor: w(0.09) },
  trackFill: { position: 'absolute', left: 0, height: 3, borderRadius: 2, backgroundColor: color.mark },
  knob: {
    position: 'absolute',
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: color.textBright,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
});
