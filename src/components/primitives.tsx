import React from 'react';
import {
  Platform,
  Pressable,
  PressableProps,
  StyleSheet,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color, fg, font, heroAngle, radius, track } from '../theme';

/**
 * Geist needs ~1.15em of line box or iOS crops the ascenders of tall figures.
 * The CSS source leans tighter than that (.94–1), so every line height here is
 * clamped up to this floor.
 */
const MIN_LEADING = 1.15;

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
          lineHeight: size * 1.25,
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
          lineHeight: Math.max(lineHeight ?? size * 1.3, size * MIN_LEADING),
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

/**
 * Set by `FieldSurface` so the `TextField` under it can hand back its node
 * without every call site threading a ref through.
 */
const FieldTarget = React.createContext<React.MutableRefObject<TextInput | null> | null>(null);

/**
 * A field's whole surface, not just the line of text in it.
 *
 * A `TextInput` answers taps across its own box and nothing else — one line of
 * text tall, inside whatever padding the container carries — so a 54pt pill with
 * an 18pt inset takes taps on a band through its middle and ignores the rest of
 * what the user can see. Aim anywhere but that band and the keyboard doesn't
 * open, which reads as a dead control rather than a small target.
 *
 * So the styled container is the target: use this in place of the `View` or
 * `Card` around a field, and a tap anywhere on it is forwarded to the input.
 * Taps that land on the input itself never reach here, so placing the cursor by
 * tapping mid-word still works.
 */
export function FieldSurface({
  style,
  children,
  ...rest
}: Omit<PressableProps, 'style' | 'onPress'> & {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const input = React.useRef<TextInput | null>(null);
  return (
    <FieldTarget.Provider value={input}>
      <Pressable
        {...rest}
        /* The input is the accessible control; this only widens where a finger
           may land, so it must not announce a second one over the top of it. */
        accessible={false}
        onPress={() => input.current?.focus()}
        style={style}
      >
        {children}
      </Pressable>
    </FieldTarget.Provider>
  );
}

/**
 * Geist body copy, editable. Mirrors `T`'s font resolution exactly so typed
 * text sits flush with the app's display text — this is the app's only
 * keyboard text entry, so it's the one place that convention has to hold.
 */
export function TextField({
  size = 12.5,
  alpha = 1,
  weight = 'regular',
  tracking = 0,
  lineHeight,
  style,
  ref,
  ...rest
}: TextInputProps & {
  size?: number;
  alpha?: number;
  weight?: 'light' | 'regular' | 'medium' | 'semibold' | 'mono' | 'monoMedium';
  tracking?: number;
  lineHeight?: number;
  ref?: React.Ref<TextInput>;
}) {
  /* Null outside a FieldSurface, which is the plain TextInput this has always
     been — nothing else has to change to keep working. */
  const target = React.useContext(FieldTarget);
  const attach = (node: TextInput | null) => {
    if (target) target.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<TextInput | null>).current = node;
  };

  return (
    <TextInput
      ref={attach}
      placeholderTextColor={fg(0.3)}
      selectionColor={color.accentBright}
      cursorColor={color.accentBright}
      keyboardAppearance="dark"
      underlineColorAndroid="transparent"
      {...rest}
      style={[
        noPad,
        {
          fontFamily: font[weight],
          fontSize: size,
          lineHeight: Math.max(lineHeight ?? size * 1.3, size * MIN_LEADING),
          letterSpacing: track(tracking, size),
          color: alpha === 1 ? color.text : fg(alpha),
          padding: 0,
        },
        style,
      ]}
    />
  );
}

/** The hero number: the figure, trailed by a dimmed light "€" on the same baseline. */
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
      <T
        weight="light"
        size={size}
        lineHeight={size * MIN_LEADING}
        tracking={-0.035}
        style={{ color: color.textBright }}
      >
        {value}
      </T>
      {children}
      <T weight="light" size={symbolSize} lineHeight={symbolSize * MIN_LEADING} alpha={0.42}>
        €
      </T>
    </View>
  );
}

/**
 * The Card look on its own, so something that is not a `View` can wear it —
 * a `FieldSurface` around a field that used to be a Card, in particular.
 */
export const cardStyle = (quiet?: boolean): ViewStyle => ({
  borderRadius: radius.card,
  backgroundColor: quiet ? color.tileQuiet : color.tile,
  borderWidth: 1,
  borderColor: quiet ? color.tileQuietBorder : color.tileBorder,
});

/** Flat surface: rgba(255,255,255,.04) over a .06 border. */
export function Card({ style, children, quiet, ...rest }: ViewProps & { quiet?: boolean }) {
  return (
    <View {...rest} style={[cardStyle(quiet), style]}>
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
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  divider: { height: 1 },
  glow: {
    shadowColor: color.accentGlow,
    shadowOpacity: 1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent },
});

/**
 * The app's page ground. Lives here rather than in `App.tsx` because the
 * full-screen editors render inside their own Modal, outside App's tree, and a
 * second copy of the gradient config is a drift waiting to happen.
 */
export function Background({ children }: { children: React.ReactNode }) {
  return (
    <LinearGradient
      colors={color.bg as unknown as [string, string, string]}
      locations={color.bgStops as unknown as [number, number, number]}
      /* CSS 178deg: essentially top-to-bottom with a hair of tilt. */
      start={{ x: 0.48, y: 0 }}
      end={{ x: 0.52, y: 1 }}
      style={{ flex: 1 }}
    >
      {children}
    </LinearGradient>
  );
}
