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
import { BlurView } from 'expo-blur';
import { color, fg, font, radius, track, w } from '../theme';
import { AddIcon, HomeIcon, SpendIcon, TrendsIcon, YouIcon } from './Icons';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
    <BlurView
      intensity={30}
      tint="dark"
      style={[styles.bar, { paddingBottom: Math.max(bottomInset, 12) + 12 }]}
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
    </BlurView>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(11,12,16,0.72)',
  },
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: w(0.055),
    borderWidth: 1,
    borderColor: w(0.07),
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
});
