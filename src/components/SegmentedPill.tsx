import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { T } from './primitives';
import { tapSelect } from '../haptics';
import { makeStyles, radius, useTheme } from '../theme';

/** Padding between the track's edge and the thumb, on all four sides. */
const INSET = 4;
const BORDER = 1;
const HEIGHT = 38;

/**
 * A two-state switch drawn as the app's rail-and-pill: the same graphite track
 * and light thumb as `TabBar`, sized for text rather than icons.
 *
 * The thumb slides rather than cutting, over `motion.ts`'s 280ms, because the
 * two labels describe the *same* edit with a different reach — a cut would read
 * as two unrelated screens. `LayoutAnimation` can't do it (the thumb is absolute,
 * not laid out), so this is a plain `Animated` value on the native driver.
 */
export function SegmentedPill<Value extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  /** Exactly two: this is a switch, and a third would need the track to scroll. */
  options: readonly [{ value: Value; label: string }, { value: Value; label: string }];
  value: Value;
  onChange: (value: Value) => void;
  accessibilityLabel?: string;
}) {
  const styles = useStyles();
  const { color, fg } = useTheme();
  /* Measured, not assumed: the track fills its column, and the thumb has to be
     exactly half of whatever that turns out to be on this device. */
  const [trackWidth, setTrackWidth] = useState(0);
  const index = options.findIndex((option) => option.value === value);
  const position = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    Animated.timing(position, {
      toValue: index,
      duration: 280,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [index, position]);

  /* `onLayout` reports the border box, and the thumb is positioned inside it. */
  const segmentWidth =
    trackWidth > 0 ? (trackWidth - (BORDER + INSET) * 2) / options.length : 0;

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={styles.track}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              width: segmentWidth,
              transform: [
                {
                  translateX: position.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, segmentWidth],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}

      {options.map((option, i) => {
        const on = i === index;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={option.label}
            onPress={() => {
              if (on) return;
              tapSelect();
              onChange(option.value);
            }}
            style={styles.segment}
          >
            {/*
              Two stacked copies rather than one animated colour: the slide runs
              on the native driver, which can carry opacity but not `color`, and
              swapping the colour on state change instead would land it a frame
              before the thumb arrives under it.
            */}
            <Animated.View style={{ opacity: position.interpolate({ inputRange: [0, 1], outputRange: i === 0 ? [1, 0] : [0, 1] }) }}>
              <T weight="medium" size={12.5} tracking={-0.01} style={{ color: color.ink }}>
                {option.label}
              </T>
            </Animated.View>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.center,
                { opacity: position.interpolate({ inputRange: [0, 1], outputRange: i === 0 ? [0, 1] : [1, 0] }) },
              ]}
            >
              <T size={12.5} tracking={-0.01} style={{ color: fg(0.55) }}>
                {option.label}
              </T>
            </Animated.View>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(({ color, w }) => ({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: INSET,
    borderRadius: radius.pill,
    /* Opaque graphite, not a white overlay: this floats over a scrolling column
       of fields, and at `w(.1)` the rows read straight through it — the same
       reason `theme.ts` gives for `color.sheet`. The tab bar can be translucent
       because what passes under it is a page ground, not text. */
    backgroundColor: color.sheet,
    borderWidth: BORDER,
    borderColor: w(0.12),
  },
  segment: {
    flex: 1,
    height: HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  thumb: {
    position: 'absolute',
    left: INSET,
    top: INSET,
    height: HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: color.textStrong,
  },
}));
