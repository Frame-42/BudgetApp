import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Amount, Eyebrow, HeroCard, T, TextField } from './primitives';
import { tapSelect } from '../haptics';
import { euroLabel, figure } from '../format';
import { morph } from '../motion';
import { makeStyles, radius, useTheme } from '../theme';

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

/*
 * The pill and the rail move on motion.ts's 280ms ease, driven by hand. `morph`
 * crossfades whatever mounts and unmounts, which is right for the figure; but
 * the pill is one control changing shape, and `morph` never animated its width
 * — as two views it ghosted the wide hint out underneath Done, as one it
 * snapped. Animating `width` itself meant a layout pass per frame on the JS
 * thread, which stuttered against the keyboard and `morph`'s own frames, so
 * everything here is opacity and transforms on the native driver instead.
 */
const MOVE = { duration: 280, easing: Easing.inOut(Easing.ease), useNativeDriver: true };
/* Putting the field away is quicker than opening it: there is nothing new to
   read on the way back, and it runs alongside the keyboard going down. */
const CLOSE_MS = 200;

/* The pill's horizontal padding in each state, plus its 1px border either side. */
const HINT_INSET = 15 * 2 + 2;
const DONE_INSET = 22 * 2 + 2;
const PILL_HEIGHT = 34;
const CAP = PILL_HEIGHT / 2;

/** Marks the "type it in" escape as an action rather than a value. */
function Pencil() {
  const { fg } = useTheme();
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

function HintLabel() {
  const styles = useStyles();
  return (
    <View style={styles.hintLabel}>
      <Pencil />
      <T size={12} alpha={0.62} numberOfLines={1}>
        Different budget? Type it in
      </T>
    </View>
  );
}

function DoneLabel() {
  const { color } = useTheme();
  return (
    <T weight="medium" size={12.5} numberOfLines={1} style={{ color: color.ink }}>
      Done
    </T>
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
  const styles = useStyles();
  const { color } = useTheme();
  const [typing, setTyping] = useState(false);
  /* Mirrors `typing` synchronously. Done's tap closes the field, and the field
     then blurs as it unmounts and asks to close again; a second `morph` would
     sit armed and slow-animate the next layout it met — the screen settling as
     the keyboard went down, which is what made closing crawl. */
  const open = useRef(false);
  const [draft, setDraft] = useState('');
  const [trackWidth, setTrackWidth] = useState(0);
  const lastTick = useRef(0);
  /* 0 is the hint, 1 is typing. The pill's width, both its faces and labels,
     and the rail's dimming all hang off this one value, so they cannot drift. */
  const progress = useRef(new Animated.Value(0)).current;
  /* Each label's natural width, measured off-screen once. Until both are known
     the pill has no width to animate between, so it waits a frame unseen. */
  const [hintWidth, setHintWidth] = useState(0);
  const [doneWidth, setDoneWidth] = useState(0);
  const measured = hintWidth > 0 && doneWidth > 0;
  const hintPill = hintWidth + HINT_INSET;
  const donePill = doneWidth + DONE_INSET;
  /* How far each end travels inward, and what the straight middle scales to. */
  const inset = (hintPill - donePill) / 2;
  const middleScale = (donePill - 2 * CAP) / Math.max(1, hintPill - 2 * CAP);

  useEffect(() => {
    Animated.timing(progress, {
      ...MOVE,
      toValue: typing ? 1 : 0,
      duration: typing ? MOVE.duration : CLOSE_MS,
    }).start();
  }, [typing, progress]);

  const along = (outputRange: number[], inputRange = [0, 1]) =>
    progress.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  /* The outline gives way to the fill early, so the shrink reads on the fill.
     The labels hand over rather than overlap: the hint's is gone before
     Done's begins. */
  const outlineOpacity = along([1, 0], [0, 0.4]);
  const fillOpacity = along([0, 1], [0, 0.4]);
  const hintLabelOpacity = along([1, 0], [0, 0.35]);
  const doneLabelOpacity = along([0, 1], [0.5, 1]);

  const fraction = clamp((valueCents - MIN_CENTS) / (MAX_CENTS - MIN_CENTS), 0, 1);

  const openTyping = () => {
    if (open.current) return;
    open.current = true;
    tapSelect();
    morph();
    setDraft(String(Math.round(valueCents / 100)));
    setTyping(true);
  };

  const closeTyping = () => {
    if (!open.current) return;
    open.current = false;
    /* Now, not when the field unmounts. Both screens let taps through to Done
       with the keyboard up, so the keyboard only fell once the field was gone
       — and `morph` keeps an outgoing view, still focused, on screen for its
       whole fade. The keyboard then followed the animation instead of joining
       it. Dismissing first sends them down together. */
    Keyboard.dismiss();
    morph(CLOSE_MS);
    setTyping(false);
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
            onBlur={closeTyping}
            onSubmitEditing={closeTyping}
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

      <Animated.View
        style={[styles.sliderBlock, { opacity: along([1, 0.35]) }]}
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
      </Animated.View>

      {/* One pill that changes shape: it shrinks from the hint to Done as the
          dashed outline gives way to the fill and the labels hand over. The
          frame keeps the hint's width throughout — only what is drawn inside
          it moves — so nothing is laid out again frame by frame. The fill is
          two round ends that slide inward and a straight middle that scales,
          which shrinks it without squashing the ends into ellipses. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={typing ? 'Done' : 'Type a different monthly budget'}
        onPress={typing ? closeTyping : openTyping}
        hitSlop={10}
        style={({ pressed }) => pressed && { opacity: typing ? 0.85 : 0.7 }}
      >
        <View style={[styles.pill, measured ? { width: hintPill } : { opacity: 0 }]}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.hintFace,
              {
                opacity: outlineOpacity,
                /* Gone before the squash would show; it only has to start the shrink. */
                transform: [{ scaleX: along([1, donePill / Math.max(1, hintPill)]) }],
              },
            ]}
          />
          {/* Grouped so the overlapping pieces fade as one shape, not three. */}
          <Animated.View
            needsOffscreenAlphaCompositing
            style={[StyleSheet.absoluteFill, { opacity: fillOpacity }]}
          >
            <Animated.View
              style={[
                styles.fillMiddle,
                { left: CAP, right: CAP, transform: [{ scaleX: along([1, middleScale]) }] },
              ]}
            />
            <Animated.View
              style={[styles.fillCap, { left: 0, transform: [{ translateX: along([0, inset]) }] }]}
            />
            <Animated.View
              style={[styles.fillCap, { right: 0, transform: [{ translateX: along([0, -inset]) }] }]}
            />
          </Animated.View>
          <Animated.View style={[styles.label, { width: hintWidth, opacity: hintLabelOpacity }]}>
            <HintLabel />
          </Animated.View>
          <Animated.View style={[styles.label, { width: doneWidth, opacity: doneLabelOpacity }]}>
            <DoneLabel />
          </Animated.View>
        </View>
      </Pressable>

      {/* The labels at their natural width, where nothing narrows them. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.measure}
      >
        <View onLayout={(e) => setHintWidth(Math.ceil(e.nativeEvent.layout.width))}>
          <HintLabel />
        </View>
        <View onLayout={(e) => setDoneWidth(Math.ceil(e.nativeEvent.layout.width))}>
          <DoneLabel />
        </View>
      </View>
    </HeroCard>
  );
}

const useStyles = makeStyles(({ color, w }) => ({
  budgetCard: { paddingVertical: 26, paddingHorizontal: 24, gap: 20, alignItems: 'center' },
  typeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  typeInput: { minWidth: 130, textAlign: 'center', color: color.textBright },
  pill: { height: PILL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  /* Dashed, like the "More" chip: unfilled reads as a control rather than a value. */
  hintFace: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: w(0.16),
    borderStyle: 'dashed',
  },
  fillMiddle: { position: 'absolute', top: 0, bottom: 0, backgroundColor: color.textStrong },
  fillCap: {
    position: 'absolute',
    top: 0,
    width: PILL_HEIGHT,
    height: PILL_HEIGHT,
    borderRadius: CAP,
    backgroundColor: color.textStrong,
  },
  /* Absolute, so both sit centred on the pill at once; flex centring does that
     for an absolute child with no insets. */
  label: { position: 'absolute', alignItems: 'center' },
  measure: { position: 'absolute', top: 0, left: 0, opacity: 0, alignItems: 'flex-start' },
  hintLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sliderBlock: { width: '100%', gap: 12 },
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
}));
