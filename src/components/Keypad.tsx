import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { T } from './primitives';
import { tapSelect } from '../haptics';
import { color, fg, radius, w } from '../theme';

const KEY_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'del'],
] as const;

/** Digits allowed before the keypad stops accepting input (the decimal point is free). */
const MAX_DIGITS = 6;

/** The design's keypad rules, kept verbatim: no second dot, no seventh digit. */
export function pressKey(current: string, key: string): string {
  if (key === 'del') return current.slice(0, -1);
  if (key === '.' && current.includes('.')) return current;
  if (current.replace('.', '').length >= MAX_DIGITS) return current;
  return current + key;
}

/** The amount keypad, shared by the Add screen and the edit sheet. */
export function Keypad({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <View style={styles.keypad}>
      {KEY_ROWS.map((row, r) => (
        <View key={r} style={styles.keyRow}>
          {row.map((key) => {
            const quiet = key === '.' || key === 'del';
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={key === 'del' ? 'Delete' : key}
                onPress={() => {
                  tapSelect();
                  onChange(pressKey(value, key));
                }}
                style={({ pressed }) => [
                  styles.key,
                  quiet ? styles.keyQuiet : styles.keySolid,
                  pressed && styles.keyPressed,
                ]}
              >
                {key === 'del' ? (
                  <T weight="mono" size={13} alpha={0.6}>
                    DEL
                  </T>
                ) : (
                  <T
                    weight="light"
                    size={22}
                    lineHeight={26}
                    style={quiet ? { color: fg(0.6) } : { color: color.textStrong }}
                  >
                    {key}
                  </T>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  keypad: { gap: 8 },
  keyRow: { flexDirection: 'row', gap: 8 },
  key: {
    flex: 1,
    height: 52,
    borderRadius: radius.key,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySolid: { backgroundColor: w(0.045), borderWidth: 1, borderColor: w(0.055) },
  keyQuiet: { backgroundColor: w(0.03) },
  keyPressed: { backgroundColor: w(0.12) },
});
