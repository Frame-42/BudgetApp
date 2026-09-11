import React from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { font, makeStyles, radius, track, useTheme } from '../theme';
import { AddIcon, HomeIcon, SpendIcon, TrendsIcon, YouIcon } from './Icons';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Intrinsic height of the rail pill (padding + icon height), for clearing scroll content. */
export const TAB_BAR_HEIGHT = 46;

export const TABS = [
  { key: 'home', label: 'Home', Icon: HomeIcon },
  { key: 'spend', label: 'Spend', Icon: SpendIcon },
  { key: 'add', label: 'Add', Icon: AddIcon },
  { key: 'trends', label: 'Trends', Icon: TrendsIcon },
  { key: 'you', label: 'You', Icon: YouIcon },
] as const;

/**
 * The floating pill nav. Only the active tab carries its label; the label
 * grows in as the pill expands, matching the design's .28s width transition.
 */
export function TabBar({
  active,
  onChange,
  bottomInset,
}: {
  active: number;
  onChange: (index: number) => void;
  bottomInset: number;
}) {
  const styles = useStyles();
  const { color, fg } = useTheme();
  const select = (index: number) => {
    LayoutAnimation.configureNext({
      duration: 280,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    onChange(index);
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.bar, { paddingBottom: Math.max(bottomInset, 12) }]}
    >
      <View style={styles.rail}>
        {TABS.map(({ key, label, Icon }, i) => {
          const on = i === active;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={label}
              onPress={() => select(i)}
              style={on ? styles.pill : styles.circle}
            >
              <Icon color={on ? color.ink : fg(0.55)} />
              {on ? <Text style={styles.pillLabel}>{label}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ color, w }) => ({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: w(0.1),
    borderWidth: 1,
    borderColor: w(0.12),
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 38,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    backgroundColor: color.textStrong,
  },
  circle: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: {
    fontFamily: font.medium,
    fontSize: 12.5,
    letterSpacing: track(-0.01, 12.5),
    color: color.ink,
  },
}));
