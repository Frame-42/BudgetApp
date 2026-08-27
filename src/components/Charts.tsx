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

/** Trends — "Pace vs last month": solid August line over a dashed July line. */
export function PaceChart() {
  return (
    <Svg viewBox="0 0 320 112" width="100%" height={112} fill="none" preserveAspectRatio="none">
      <Path d="M0 12h320M0 56h320M0 100h320" stroke={w(0.055)} strokeWidth={1} />
      <Path
        d="M0 100C8.6 97.6 34.4 90.7 51.6 85.7C68.8 80.8 85.8 75.3 103 70.3C120.2 65.3 137.8 60.5 155 55.7C172.2 50.9 188.8 46.2 206 41.7C223.2 37.2 239 32.3 258 28.5C277 24.7 309.7 20.7 320 19.1"
        stroke="rgba(244,245,247,.32)"
        strokeWidth={1.6}
        strokeDasharray="4 5"
        strokeLinecap="round"
      />
      <Path
        d="M0 100C8.6 98 34.4 92.6 51.6 88.2C68.8 83.8 85.8 78.4 103 73.6C120.2 68.8 137.8 63.9 155 59.3C172.2 54.7 197.5 48.3 206 46.1"
        stroke={color.mark}
        strokeWidth={2.1}
        strokeLinecap="round"
      />
      <Circle cx={206} cy={46.1} r={3.4} fill={color.mark} />
      <Circle cx={206} cy={46.1} r={7} fill="none" stroke="rgba(233,235,242,.22)" strokeWidth={1.2} />
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
export function SplitDonut({
  segments,
  children,
}: {
  segments: { alpha: number; dash: number; offset: number }[];
  children: React.ReactNode;
}) {
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
              strokeDasharray={`${s.dash} ${277 - s.dash}`}
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
