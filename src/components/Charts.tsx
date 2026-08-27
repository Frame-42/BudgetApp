import React from 'react';
import { StyleSheet, View } from 'react-native';
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
const DONUT_CIRCUMFERENCE = 2 * Math.PI * 44;

export function SplitDonut({
  shares,
  children,
}: {
  shares: { alpha: number; percent: number }[];
  children: React.ReactNode;
}) {
  // Each arc starts where the previous one ended; a negative dash offset walks
  // the pattern forward around the ring.
  let consumed = 0;
  const segments = shares.map((share) => {
    const dash = (share.percent / 100) * DONUT_CIRCUMFERENCE;
    const segment = { alpha: share.alpha, dash, offset: -consumed };
    consumed += dash;
    return segment;
  });

  return (
    <View style={styles.donut}>
      <Svg width={118} height={118} viewBox="0 0 118 118" fill="none">
        <G rotation={-90} origin="59, 59">
          <Circle cx={59} cy={59} r={44} stroke={w(0.05)} strokeWidth={13} fill="none" />
          {segments.map((s, i) => (
            <Circle
              key={i}
              cx={59}
              cy={59}
              r={44}
              fill="none"
              stroke={`rgba(233,235,242,${s.alpha})`}
              strokeWidth={13}
              strokeDasharray={`${s.dash} ${DONUT_CIRCUMFERENCE - s.dash}`}
              strokeDashoffset={s.offset}
            />
          ))}
        </G>
      </Svg>
      <View style={styles.donutCenter}>{children}</View>
    </View>
  );
}

const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

const styles = StyleSheet.create({
  ring74: { width: 74, height: 74 },
  ringCenter: { ...fill, alignItems: 'center', justifyContent: 'center' },
  donut: { width: 118, height: 118 },
  donutCenter: {
    ...fill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
});
