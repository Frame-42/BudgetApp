/**
 * Design tokens transcribed from the "iPhone Budgeting App" canvas
 * (Budget Home.dc.html -> Phone.dc.html).
 *
 * The source is monochrome graphite: every surface is a white overlay at a
 * low alpha, and the only chroma in the whole app is the status accent. The
 * light scheme is the same design inverted — ink overlays over a pearl ground —
 * so every token keeps its role and only its value changes.
 */
import { createContext, useContext } from 'react';
import { StyleSheet } from 'react-native';

export type Scheme = 'dark' | 'light';

/** The user's choice, of which `system` resolves to a `Scheme` at runtime. */
export type Appearance = 'system' | Scheme;

/**
 * Following the phone, except while developing: a dev build opens dark, the
 * scheme the design was drawn in. Only the default — a stored choice wins in
 * either build.
 */
export const DEFAULT_APPEARANCE: Appearance = __DEV__ ? 'dark' : 'system';

/** Stored uppercase, as every other setting is; anything unknown is the default. */
export const parseAppearance = (stored: string | null | undefined): Appearance =>
  stored === 'DARK'
    ? 'dark'
    : stored === 'LIGHT'
      ? 'light'
      : stored === 'SYSTEM'
        ? 'system'
        : DEFAULT_APPEARANCE;

/** The scheme an appearance comes to, given the phone's. */
export const resolveScheme = (appearance: Appearance, system: Scheme): Scheme =>
  appearance === 'system' ? system : appearance;

const rgba = (rgb: string) => (alpha: number) => `rgba(${rgb},${alpha})`;

function palette(scheme: Scheme) {
  const dark = scheme === 'dark';
  /** Overlay — surfaces, borders, hairlines. White over graphite, ink over pearl. */
  const w = rgba(dark ? '255,255,255' : '23,24,28');
  /**
   * Foreground at an alpha — body copy and its quieter tiers. In light, the
   * secondary tier (≈.45) lands on #929398 over a card.
   */
  const fg = rgba(dark ? '244,245,247' : '23,24,28');
  /** The mark colour at an alpha — chart fills and category shades. */
  const mark = rgba(dark ? '233,235,242' : '40,43,52');

  const color = dark
    ? {
        text: '#f4f5f7',
        textBright: '#f7f8fa',
        textStrong: '#f2f3f7',
        /** Text on a filled `textStrong` surface. */
        ink: '#0d0e12',

        /** Filled bars, active chart marks, the "on" pill. */
        mark: '#e9ebf2',

        /** oklch(.78 .045 265) — status dot. */
        accent: '#a9b8d5',
        /** oklch(.82 .05 265) — positive deltas, income, caret. */
        accentBright: '#b4c4e5',
        /** oklch(.78 .09 265 / .55) — dot glow. */
        accentGlow: 'rgba(155,183,242,0.55)',
        /** An armed destructive action's outline. */
        accentLine: 'rgba(180,196,229,0.4)',

        /** linear-gradient(178deg, ...) page wash. */
        bg: ['#14161c', '#0d0e12', '#0b0c10'] as [string, string, string],

        /** Hero tiles: linear-gradient(165deg, rgba(255,255,255,.075), rgba(255,255,255,.025)). */
        hero: [w(0.075), w(0.025)] as [string, string],
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
        /** The page ground at an alpha, for bars that float over scrolling content. */
        scrim: 'rgba(11,12,16,0.72)',

        hairline: w(0.055),
        track: w(0.08),
      }
    : {
        text: '#17181c',
        textBright: '#17181c',
        textStrong: '#17181c',
        ink: '#fffefc',

        mark: '#282b34',

        /* The accents keep their hue and drop in lightness, or they would vanish
           into the ground they are meant to stand out from. */
        accent: '#7384ab',
        accentBright: '#4d6090',
        accentGlow: 'rgba(96,120,178,0.4)',
        accentLine: 'rgba(77,96,144,0.4)',

        /** Pearl, not white — and flat, where the dark ground falls away. */
        bg: ['#f6f4ef', '#f6f4ef', '#f6f4ef'] as [string, string, string],

        /* Cards are lifted *above* the ground here rather than overlaid on it, the
           way white-on-graphite reads as raised in the dark scheme. One card colour
           and one border for every tier: quiet tiles differ in dark only because
           an overlay can't be made quieter any other way. */
        hero: ['#fffefc', '#fffefc'] as [string, string],
        heroBorder: '#e7e4de',

        tile: '#fffefc',
        tileBorder: '#e7e4de',
        tileQuiet: '#fffefc',
        tileQuietBorder: '#e7e4de',

        sheet: '#fffefc',
        scrim: 'rgba(246,244,239,0.72)',

        hairline: '#e7e4de',
        track: w(0.08),
      };

  return {
    scheme,
    w,
    fg,
    mark,
    color: { ...color, bgStops: [0, 0.34, 1] as [number, number, number] },
    /** `BlurView`'s tint and the keyboard's, which only know the two words. */
    tint: scheme,
    /** expo-status-bar names the glyph colour, which is the opposite of the scheme. */
    statusBar: (dark ? 'light' : 'dark') as 'light' | 'dark',
  };
}

export type Palette = ReturnType<typeof palette>;

export const palettes: Record<Scheme, Palette> = { dark: palette('dark'), light: palette('light') };

/** The palette in force. App.tsx provides it; outside a provider it is the dark one. */
export const ThemeContext = createContext<Palette>(palettes.dark);

export const useTheme = () => useContext(ThemeContext);

/**
 * A StyleSheet that depends on the palette. Built once per scheme and cached, so
 * a render costs a lookup; calling the returned hook is also what re-renders a
 * component when the scheme changes.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (theme: Palette) => T & StyleSheet.NamedStyles<any>,
): () => T {
  const cache: Partial<Record<Scheme, T>> = {};
  return function useStyles() {
    const theme = useTheme();
    return (cache[theme.scheme] ??= StyleSheet.create(factory(theme)));
  };
}

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
