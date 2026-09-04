import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { color, w } from '../theme';
import { T } from './primitives';

/**
 * Home hero ring — 61% of the month's budget used.
 * Geometry (r=32, stroke 5, dasharray 201) is taken straight from the design.
 */
export function BudgetRing({ percent }: { percent: number }) {
  const CIRC = 201;
  return (
    <View style={styles.ring74}>
      <Svg width={74} height={74} viewBox="0 0 74 74">
        <G rotation={-90} origin="37, 37">
          <Circle cx={37} cy={37} r={32} fill="none" stroke={w(0.09)} strokeWidth={5} />
          <Circle
            cx={37}
            cy={37}
            r={32}
            fill="none"
            stroke={color.mark}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - percent / 100)}
          />
        </G>
      </Svg>
      <View style={styles.ringCenter}>
        <T weight="medium" size={14} tracking={-0.02}>
          {percent}%
        </T>
      </View>
    </View>
  );
}

/**
 * Trends — "Pace vs last month": cumulative spend this month over last month's
 * dashed trace. Both series are fractions of the same peak, laid out on a shared
 * day axis, so the two lines are directly comparable.
 */
const PLOT = { width: 320, top: 12, bottom: 100 };

function linePath(values: number[], days: number): string {
  if (values.length === 0) return '';
  const x = (i: number) => (days <= 1 ? 0 : (i / (days - 1)) * PLOT.width);
  const y = (v: number) => PLOT.bottom - v * (PLOT.bottom - PLOT.top);
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');
}

export function PaceChart({ current, previous }: { current: number[]; previous: number[] }) {
  const days = Math.max(current.length, previous.length, 2);
  const head = current.length
    ? {
        x: ((current.length - 1) / (days - 1)) * PLOT.width,
        y: PLOT.bottom - current[current.length - 1] * (PLOT.bottom - PLOT.top),
      }
    : null;

  return (
    <Svg viewBox="0 0 320 112" width="100%" height={112} fill="none" preserveAspectRatio="none">
      <Path d="M0 12h320M0 56h320M0 100h320" stroke={w(0.055)} strokeWidth={1} />
      <Path
        d={linePath(previous, days)}
        stroke="rgba(244,245,247,.32)"
        strokeWidth={1.6}
        strokeDasharray="4 5"
        strokeLinecap="round"
      />
      <Path d={linePath(current, days)} stroke={color.mark} strokeWidth={2.1} strokeLinecap="round" />
      {head ? (
        <>
          <Circle cx={head.x} cy={head.y} r={3.4} fill={color.mark} />
          <Circle cx={head.x} cy={head.y} r={7} fill="none" stroke="rgba(233,235,242,.22)" strokeWidth={1.2} />
        </>
      ) : null}
    </Svg>
  );
}

/** A 14px legend rule — solid for August, dashed for July. RN borders can't dash a 1px line. */
export function LegendRule({ dashed }: { dashed?: boolean }) {
  return (
    <Svg width={14} height={2} fill="none">
      <Path
        d="M0 1h14"
        stroke={dashed ? 'rgba(244,245,247,.45)' : color.mark}
        strokeWidth={2}
        strokeDasharray={dashed ? '2.5 2.5' : undefined}
      />
    </Svg>
  );
}

/** Trends — "Where it goes": five arcs of one grey, stepped down in alpha. */
const DONUT_RADIUS = 48;
const DONUT_STROKE = 13;

/** How much a picked arc thickens — it grows in place rather than stepping out. */
const DONUT_EXPAND = 2;

/** The break between two arcs, measured as arc length on the ring. */
const DONUT_GAP = 5;

/** Wide enough for the thickest arc to sit inside its frame. */
const DONUT_BOX = 2 * (DONUT_RADIUS + (DONUT_STROKE + DONUT_EXPAND) / 2) + 6;
const DONUT_MID = DONUT_BOX / 2;
const DONUT_CIRC = 2 * Math.PI * DONUT_RADIUS;

/** The one grey every arc is painted in; only its alpha changes. */
const ARC_RGB = '233,235,242';

/**
 * What an arc that lost the selection steps back to. A picked arc keeps its own
 * rung on the category ladder, and the lowest of those is .16 — so the whole
 * dimmed run is scaled to land under it, the top category included. Anything
 * shallower and dimming the 45% category still leaves it brighter than a picked
 * 18% one, and the ring points at the wrong answer. Scaling rather than
 * clamping keeps the dimmed arcs in their own order, near the ring's track.
 */
export function dimAlpha(alpha: number): number {
  return alpha * 0.065;
}

export function SplitDonut({
  shares,
  children,
  onPressShare,
}: {
  shares: { alpha: number; percent: number; popped?: boolean }[];
  children: React.ReactNode;
  /** Makes the arcs themselves the control, by index into `shares`. */
  onPressShare?: (index: number) => void;
}) {
  // One arc is the whole ring, and a ring with a bite out of it reads as a gap
  // in the data rather than as a join.
  const whole = shares.length < 2;

  // Each arc starts where the previous one ended, so the walk is kept as a
  // fraction of the turn and only the drawn dash is trimmed back.
  let consumed = 0;
  const segments = shares.map((share, i) => {
    const fraction = share.percent / 100;
    const popped = share.popped ?? false;
    const stroke = DONUT_STROKE + (popped ? DONUT_EXPAND : 0);
    const span = fraction * DONUT_CIRC;
    // A round cap hangs half a stroke past each end of the dash, so the gap is
    // cut out of the dash together with both caps, and what is left is centred
    // on the share it stands for.
    const dash = whole ? span : Math.max(span - DONUT_GAP - stroke, 0.6);
    const segment = {
      key: i,
      alpha: share.alpha,
      popped,
      stroke,
      dash,
      rest: DONUT_CIRC - dash,
      offset: -(consumed * DONUT_CIRC + (span - dash) / 2),
    };
    consumed += fraction;
    return segment;
  });

  /**
   * Which arc a touch landed on, worked out from the angle rather than left to
   * the SVG: a dashed stroke is one circle wearing five coats of paint, so its
   * own hit test cannot tell the arcs apart. The gaps stay live, and fall to
   * the arc the angle sits in.
   */
  const arcAt = (x: number, y: number): number | null => {
    const dx = x - DONUT_MID;
    const dy = y - DONUT_MID;
    const distance = Math.hypot(dx, dy);
    const reach = (DONUT_STROKE + DONUT_EXPAND) / 2 + 4;
    if (distance < DONUT_RADIUS - reach || distance > DONUT_RADIUS + reach) return null;
    // Clockwise from twelve, matching the -90° turn the arcs are drawn under.
    const turn = ((Math.atan2(dx, -dy) / (2 * Math.PI)) + 1) % 1;
    let walked = 0;
    for (let i = 0; i < shares.length; i++) {
      walked += shares[i].percent / 100;
      if (turn < walked) return i;
    }
    // Rounded percentages can leave a sliver past the last arc; it is still its.
    return shares.length ? shares.length - 1 : null;
  };

  return (
    <Pressable
      disabled={!onPressShare}
      /* The legend beside it carries the same choices, labelled. */
      accessible={false}
      importantForAccessibility="no"
      onPress={(event) => {
        const index = arcAt(event.nativeEvent.locationX, event.nativeEvent.locationY);
        if (index !== null) onPressShare?.(index);
      }}
      style={styles.donut}
    >
      <Svg width={DONUT_BOX} height={DONUT_BOX} viewBox={`0 0 ${DONUT_BOX} ${DONUT_BOX}`} fill="none">
        <G rotation={-90} origin={`${DONUT_MID}, ${DONUT_MID}`}>
          <Circle
            cx={DONUT_MID}
            cy={DONUT_MID}
            r={DONUT_RADIUS}
            stroke={w(0.05)}
            strokeWidth={DONUT_STROKE}
            fill="none"
          />
          {/* Thickened arcs last, so their ends sit over the ones beside them. */}
          {[...segments].sort((a, b) => Number(a.popped) - Number(b.popped)).map((s) => (
            <Circle
              key={s.key}
              cx={DONUT_MID}
              cy={DONUT_MID}
              r={DONUT_RADIUS}
              fill="none"
              stroke={`rgba(${ARC_RGB},${s.alpha})`}
              strokeWidth={s.stroke}
              strokeLinecap="round"
              strokeDasharray={`${s.dash} ${s.rest}`}
              strokeDashoffset={s.offset}
            />
          ))}
        </G>
      </Svg>
      <View pointerEvents="none" style={styles.donutCenter}>
        {children}
      </View>
    </Pressable>
  );
}

const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

const styles = StyleSheet.create({
  ring74: { width: 74, height: 74 },
  ringCenter: { ...fill, alignItems: 'center', justifyContent: 'center' },
  donut: { width: DONUT_BOX, height: DONUT_BOX },
  donutCenter: {
    ...fill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
});
