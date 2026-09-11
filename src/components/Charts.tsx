import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { makeStyles, useTheme } from '../theme';
import { T } from './primitives';

/**
 * Home hero ring — 61% of the month's budget used.
 * Geometry (r=32, stroke 5, dasharray 201) is taken straight from the design.
 */
export function BudgetRing({ percent }: { percent: number }) {
  const styles = useStyles();
  const { color, w } = useTheme();
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

/**
 * How tightly a Catmull-Rom spline hugs its points versus rounds the corner
 * between them — the standard 1/6 factor, which is the least tension that
 * still passes through every point exactly. Higher softens the curve further
 * but starts to overshoot past the peak on a sharp day-to-day jump.
 */
const CURVE_TENSION = 6;

function linePath(values: number[], days: number): string {
  if (values.length === 0) return '';
  const x = (i: number) => (days <= 1 ? 0 : (i / (days - 1)) * PLOT.width);
  const y = (v: number) => PLOT.bottom - v * (PLOT.bottom - PLOT.top);
  const points = values.map((v, i) => ({ x: x(i), y: y(v) }));

  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (points.length < 3) {
    return points.slice(1).reduce((path, p) => `${path} L${p.x.toFixed(1)} ${p.y.toFixed(1)}`, d);
  }
  // A day's straight segment reads as a kink once spend jumps unevenly; a
  // Catmull-Rom spline through the same points instead eases into and out of
  // each one, which is what a "pace so far" line should look like. The two
  // control points per segment come from the point before and after it, so
  // the curve still passes through every recorded day exactly.
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / CURVE_TENSION;
    const c1y = p1.y + (p2.y - p0.y) / CURVE_TENSION;
    const c2x = p2.x - (p3.x - p1.x) / CURVE_TENSION;
    const c2y = p2.y - (p3.y - p1.y) / CURVE_TENSION;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function PaceChart({ current, previous }: { current: number[]; previous: number[] }) {
  const { color, w, fg, mark } = useTheme();
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
        stroke={fg(0.32)}
        strokeWidth={1.6}
        strokeDasharray="4 5"
        strokeLinecap="round"
      />
      <Path d={linePath(current, days)} stroke={color.mark} strokeWidth={2.1} strokeLinecap="round" />
      {head ? (
        <>
          <Circle cx={head.x} cy={head.y} r={3.4} fill={color.mark} />
          <Circle cx={head.x} cy={head.y} r={7} fill="none" stroke={mark(0.22)} strokeWidth={1.2} />
        </>
      ) : null}
    </Svg>
  );
}

/** A 14px legend rule — solid for August, dashed for July. RN borders can't dash a 1px line. */
export function LegendRule({ dashed }: { dashed?: boolean }) {
  const { color, fg } = useTheme();
  return (
    <Svg width={14} height={2} fill="none">
      <Path
        d="M0 1h14"
        stroke={dashed ? fg(0.45) : color.mark}
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

export type DonutShare = {
  alpha: number;
  percent: number;
  totalCents: number;
  popped?: boolean;
};

export function donutSegments(shares: DonutShare[]) {
  const whole = shares.length < 2;
  const totalCents = shares.reduce((sum, share) => sum + share.totalCents, 0) || 1;
  const spans = shares.map((share) => (share.totalCents / totalCents) * DONUT_CIRC);
  const requestedStrokes = shares.map(
    (share) => DONUT_STROKE + (share.popped ? DONUT_EXPAND : 0),
  );
  const smallestSpan = Math.min(...spans);
  const gap = whole ? 0 : Math.min(DONUT_GAP, smallestSpan / 2);

  let consumed = 0;
  const segments = shares.map((share, i) => {
    const popped = share.popped ?? false;
    const span = spans[i];
    const available = span - gap;
    const minimumPath = Math.min(0.1, available / 2);
    const stroke = Math.min(requestedStrokes[i], available - minimumPath);
    const inset = whole ? 0 : (gap + stroke) / 2;
    const start = consumed * DONUT_CIRC + inset;
    const end = consumed * DONUT_CIRC + span - inset;
    const segment = {
      key: i,
      alpha: share.alpha,
      popped,
      stroke,
      start,
      end,
      largeArc: end - start > DONUT_CIRC / 2,
    };
    consumed += span / DONUT_CIRC;
    return segment;
  });
  return { segments, totalCents, gap };
}

export function SplitDonut({
  shares,
  children,
  onPressShare,
}: {
  shares: DonutShare[];
  children: React.ReactNode;
  /** Makes the arcs themselves the control, by index into `shares`. */
  onPressShare?: (index: number) => void;
}) {
  const styles = useStyles();
  /* The one grey every arc is painted in; only its alpha changes. */
  const { mark } = useTheme();
  // Display percentages are integers; cents retain the exact proportions the
  // geometry and hit testing need.
  const { segments, totalCents } = donutSegments(shares);
  const whole = shares.length < 2;

  /**
   * Which arc a touch landed on, worked out from its angle. The small visual
   * gaps stay live and fall to the share whose allocation contains the angle.
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
      walked += shares[i].totalCents / totalCents;
      if (turn < walked) return i;
    }
    // Floating-point accumulation can leave a microscopic tail at the wrap.
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
          {/* Thickened arcs last, so their ends sit over the ones beside them. */}
          {[...segments].sort((a, b) => Number(a.popped) - Number(b.popped)).map((s) => {
            if (whole) {
              return (
                <Circle
                  key={s.key}
                  cx={DONUT_MID}
                  cy={DONUT_MID}
                  r={DONUT_RADIUS}
                  fill="none"
                  stroke={mark(s.alpha)}
                  strokeWidth={s.stroke}
                  strokeLinecap="round"
                />
              );
            }

            const point = (distance: number) => ({
              x: DONUT_MID + DONUT_RADIUS * Math.cos(distance / DONUT_RADIUS),
              y: DONUT_MID + DONUT_RADIUS * Math.sin(distance / DONUT_RADIUS),
            });
            const from = point(s.start);
            const to = point(s.end);
            return (
              <Path
                key={s.key}
                d={`M ${from.x} ${from.y} A ${DONUT_RADIUS} ${DONUT_RADIUS} 0 ${s.largeArc ? 1 : 0} 1 ${to.x} ${to.y}`}
                fill="none"
                stroke={mark(s.alpha)}
                strokeWidth={s.stroke}
                strokeLinecap="round"
              />
            );
          })}
        </G>
      </Svg>
      <View pointerEvents="none" style={styles.donutCenter}>
        {children}
      </View>
    </Pressable>
  );
}

const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

const useStyles = makeStyles(() => ({
  ring74: { width: 74, height: 74 },
  ringCenter: { ...fill, alignItems: 'center', justifyContent: 'center' },
  donut: { width: DONUT_BOX, height: DONUT_BOX },
  donutCenter: {
    ...fill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
}));
