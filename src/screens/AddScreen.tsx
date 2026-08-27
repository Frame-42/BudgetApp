import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Eyebrow, HeroCard, T } from '../components/primitives';
import { figure, parseAmountToCents } from '../format';
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

/** 03 — Add: expense entry. */
export function AddScreen({
  amount,
  onAmountChange,
  categories,
  categoryId,
  onCategoryChange,
  leftToSpendCents,
  daysRemaining,
  onCancel,
  onSubmit,
}: {
  amount: string;
  onAmountChange: (next: string) => void;
  categories: { id: string; name: string }[];
  categoryId: string | null;
  onCategoryChange: (next: string) => void;
  leftToSpendCents: number;
  daysRemaining: number;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const display = amount === '' ? '0' : amount;
  const remainingCents = leftToSpendCents - parseAmountToCents(amount);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <T size={19} lineHeight={21} tracking={-0.01}>
          New expense
        </T>
        <Pressable onPress={onCancel} hitSlop={10}>
          {({ pressed }) => (
            <T size={12} alpha={pressed ? 0.7 : 0.4}>
              Cancel
            </T>
          )}
        </Pressable>
      </View>

      <HeroCard style={styles.hero}>
        <Eyebrow>Amount</Eyebrow>
        <View style={styles.amountRow}>
          <T
            weight="light"
            size={52}
            lineHeight={52 * 1.15}
            tracking={-0.04}
            style={{ color: color.textBright }}
          >
            {display}
          </T>
          {/* The caret sits against the last digit; the symbol trails the whole figure. */}
          <View style={styles.caret} />
          <T weight="light" size={24} lineHeight={24} alpha={0.36}>
            €
          </T>
        </View>
        <T size={11.5} alpha={0.38}>
          Leaves {figure(remainingCents)} € for {daysRemaining} days
        </T>
      </HeroCard>

      <View style={styles.chips}>
        {categories.map((cat) => {
          const on = cat.id === categoryId;
          return (
            <Pressable
              key={cat.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onCategoryChange(cat.id)}
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
                  onPress={() => onAmountChange(pressKey(amount, key))}
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

      <Pressable
        accessibilityRole="button"
        onPress={onSubmit}
        style={({ pressed }) => [styles.submit, pressed && { opacity: 0.85 }]}
      >
        <T weight="medium" size={13.5} tracking={-0.01} style={{ color: color.ink }}>
          Add expense
        </T>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 2,
  },
  hero: { paddingVertical: 28, paddingHorizontal: 24, gap: 14, alignItems: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  caret: {
    width: 1.5,
    height: 44,
    borderRadius: 2,
    backgroundColor: color.accentBright,
    alignSelf: 'center',
  },
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
  submit: {
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: color.textStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
