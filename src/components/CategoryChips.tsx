import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { T } from './primitives';
import { tapSelect } from '../haptics';
import { color, fg, radius, w } from '../theme';

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
      {categories.map((cat) => {
        const on = cat.id === value;
        return (
          <Pressable
            key={cat.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => {
              tapSelect();
              onChange(cat.id);
            }}
            style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
          >
            <T
              size={12}
              weight={on ? 'medium' : 'regular'}
              style={on ? { color: color.ink } : { color: fg(0.6) }}
            >
              {cat.name}
            </T>
          </Pressable>
        );
      })}
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
  chipOn: { backgroundColor: color.textStrong },
  chipOff: { backgroundColor: w(0.05), borderWidth: 1, borderColor: w(0.07) },
});
