import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { T } from './primitives';
import { tapSelect } from '../haptics';
import { color, fg, radius, w } from '../theme';

/** One pill. Split out so onboarding can build a multi-select row from the same
 *  shape without bending this file's single-select contract. */
export function Chip({
  label,
  on,
  onPress,
  size = 'sm',
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  /** Onboarding draws the same pill a size up; the tab screens stay at 'sm'. */
  size?: 'sm' | 'md';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        tapSelect();
        onPress();
      }}
      style={[styles.chip, size === 'md' && styles.chipMd, on ? styles.chipOn : styles.chipOff]}
    >
      <T
        size={size === 'md' ? 12.5 : 12}
        weight={on ? 'medium' : 'regular'}
        style={on ? { color: color.ink } : { color: fg(size === 'md' ? 0.58 : 0.6) }}
      >
        {label}
      </T>
    </Pressable>
  );
}

/** The category selector, shared by the Add screen and the edit sheet. */
export function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: { id: string; name: string }[];
  value: string | null;
  onChange: (next: string) => void;
}) {
  return (
    <View style={styles.chips}>
      {categories.map((cat) => (
        <Chip
          key={cat.id}
          label={cat.name}
          on={cat.id === value}
          onPress={() => onChange(cat.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 2 },
  chip: {
    height: 34,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipMd: { height: 38, paddingHorizontal: 17 },
  chipOn: { backgroundColor: color.textStrong },
  chipOff: { backgroundColor: w(0.05), borderWidth: 1, borderColor: w(0.07) },
});
