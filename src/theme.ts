/**
 * Design tokens transcribed from the "iPhone Budgeting App" canvas
 * (Budget Home.dc.html -> Phone.dc.html).
 *
 * The source is monochrome graphite: every surface is a white overlay at a
 * low alpha, and the only chroma in the whole app is the status accent.
 */

/** White overlay — surfaces, borders, hairlines. */
export const w = (alpha: number) => `rgba(255,255,255,${alpha})`;

/** Foreground (#f4f5f7) at an alpha — body copy and its quieter tiers. */
export const fg = (alpha: number) => `rgba(244,245,247,${alpha})`;

export const color = {
  text: '#f4f5f7',
  textBright: '#f7f8fa',
  textStrong: '#f2f3f7',
  ink: '#0d0e12',

  /** Filled bars, active chart marks, the "on" pill. */
  mark: '#e9ebf2',

  /** oklch(.78 .045 265) — status dot. */
  accent: '#a9b8d5',
  /** oklch(.82 .05 265) — positive deltas, income, caret. */
  accentBright: '#b4c4e5',
  /** oklch(.78 .09 265 / .55) — dot glow. */
  accentGlow: 'rgba(155,183,242,0.55)',

  /** linear-gradient(178deg, ...) page wash. */
  bg: ['#14161c', '#0d0e12', '#0b0c10'] as const,
  bgStops: [0, 0.34, 1] as const,

  /** Hero tiles: linear-gradient(165deg, rgba(255,255,255,.075), rgba(255,255,255,.025)). */
  hero: [w(0.075), w(0.025)] as const,
  heroBorder: w(0.075),

  /** Flat tiles. */
  tile: w(0.04),
  tileBorder: w(0.06),
  /** Quiet tiles (Next out, insight, sign out). */
  tileQuiet: w(0.03),
  tileQuietBorder: w(0.055),

  /**
   * Sheets sit over blurred content, so they are opaque graphite rather than a
   * white overlay — an alpha surface here would let the list read through.
   */
  sheet: '#171921',

  hairline: w(0.055),
  track: w(0.08),
} as const;

/** 165deg in CSS ≈ down and slightly right. */
export const heroAngle = { start: { x: 0.2, y: 0 }, end: { x: 0.8, y: 1 } };

export const font = {
  light: 'Geist_300Light',
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

/** CSS letter-spacing is in em; RN wants px. */
export const track = (em: number, size: number) => em * size;

export const radius = { hero: 26, card: 24, tile: 22, key: 16, pill: 999 } as const;

/** Horizontal padding of the scrolling column. */
export const GUTTER = 20;
