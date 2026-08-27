import React from 'react';
import { Platform, StyleSheet, Text, TextProps, View, ViewProps, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color, fg, font, heroAngle, radius, track } from '../theme';

/** Android adds extra leading to text; the design's tight line heights need it off. */
const noPad = Platform.select({ android: { includeFontPadding: false }, default: {} }) as object;

/**
 * The uppercase Geist Mono micro-label used above almost every value in the
 * design ("LEFT TO SPEND", "DAILY PACE", "TODAY", ...).
 */
export function Eyebrow({
  children,
  size = 9.5,
  alpha = 0.34,
  tracking = 0.16,
  style,
  ...rest
}: TextProps & { size?: number; alpha?: number; tracking?: number }) {
  return (
    <Text
      {...rest}
      style={[
        noPad,
        {
          fontFamily: font.monoMedium,
          fontSize: size,
          lineHeight: size,
          letterSpacing: track(tracking, size),
          color: fg(alpha),
        },
        style,
      ]}
    >
      {typeof children === 'string' ? children.toUpperCase() : children}
    </Text>
  );
}

/** Geist body copy. `weight` mirrors the CSS font-weights used in the source. */
export function T({
  children,
  size = 12.5,
  alpha = 1,
  weight = 'regular',
  tracking = 0,
  lineHeight,
  style,
  ...rest
}: TextProps & {
  size?: number;
  alpha?: number;
  weight?: 'light' | 'regular' | 'medium' | 'semibold' | 'mono' | 'monoMedium';
  tracking?: number;
  lineHeight?: number;
}) {
  return (
    <Text
      {...rest}
      style={[
        noPad,
        {
          fontFamily: font[weight],
          fontSize: size,
          lineHeight: lineHeight ?? size * 1.3,
          letterSpacing: track(tracking, size),
          color: alpha === 1 ? color.text : fg(alpha),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** The hero number: a dimmed light "$" on the same baseline as the figure. */
export function Amount({
  value,
  size = 54,
  symbolSize = 26,
  children,
}: {
  value: string;
  size?: number;
  symbolSize?: number;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.amountRow}>
      <T weight="light" size={symbolSize} lineHeight={symbolSize} alpha={0.42}>
        $
      </T>
      <T
        weight="light"
        size={size}
        lineHeight={size * 0.94}
        tracking={-0.035}
        style={{ color: color.textBright }}
      >
        {value}
      </T>
      {children}
    </View>
  );
}

/** Flat surface: rgba(255,255,255,.04) over a .06 border. */
export function Card({ style, children, quiet, ...rest }: ViewProps & { quiet?: boolean }) {
  return (
    <View
      {...rest}
      style={[
        {
          borderRadius: radius.card,
          backgroundColor: quiet ? color.tileQuiet : color.tile,
          borderWidth: 1,
          borderColor: quiet ? color.tileQuietBorder : color.tileBorder,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Raised surface: the 165deg white wash used for every screen's lead tile. */
export function HeroCard({ style, children }: { style?: ViewStyle | ViewStyle[]; children: React.ReactNode }) {
  return (
    <LinearGradient
      colors={color.hero as unknown as [string, string]}
      start={heroAngle.start}
      end={heroAngle.end}
      style={[
        { borderRadius: radius.hero, borderWidth: 1, borderColor: color.heroBorder },
        style as ViewStyle,
      ]}
    >
      {children}
    </LinearGradient>
  );
}

/** 1px rule that fades out to the right. */
export function Divider() {
  return (
    <LinearGradient
      colors={[color.tileBorder, 'rgba(255,255,255,0)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.divider}
    />
  );
}

/** The one spot of colour in the app: an "on track" status dot with its glow. */
export function StatusDot() {
  return (
    <View style={styles.glow}>
      <View style={styles.dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  divider: { height: 1 },
  glow: {
    shadowColor: color.accentGlow,
    shadowOpacity: 1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent },
});
