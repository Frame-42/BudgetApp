import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { cardStyle, Eyebrow, FieldSurface, HeroCard, T, TextField } from '../components/primitives';
import { CategoryChips } from '../components/CategoryChips';
import { Keypad } from '../components/Keypad';
import { figure, MAX_MERCHANT_LENGTH, parseAmountToCents } from '../format';
import { color, radius } from '../theme';

/** 03 — Add: expense entry. */
export function AddScreen({
  amount,
  onAmountChange,
  merchant,
  onMerchantChange,
  categories,
  categoryId,
  onCategoryChange,
  leftToSpendCents,
  daysRemaining,
  onSubmit,
}: {
  amount: string;
  onAmountChange: (next: string) => void;
  merchant: string;
  onMerchantChange: (next: string) => void;
  categories: { id: string; name: string }[];
  categoryId: string | null;
  onCategoryChange: (next: string) => void;
  leftToSpendCents: number;
  daysRemaining: number;
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
          <T weight="light" size={24} lineHeight={24} alpha={0.36}>
            €
          </T>
        </View>
        <T size={11.5} alpha={0.38}>
          Leaves {figure(remainingCents)} € for {daysRemaining} days
        </T>
      </HeroCard>

      <CategoryChips categories={categories} value={categoryId} onChange={onCategoryChange} />

      <FieldSurface style={[cardStyle(true), styles.nameCard]}>
        <Eyebrow>For</Eyebrow>
        <TextField
          value={merchant}
          onChangeText={onMerchantChange}
          maxLength={MAX_MERCHANT_LENGTH}
          placeholder="Quick entry"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          size={14}
          style={{ color: color.textStrong }}
        />
      </FieldSurface>

      <Keypad value={amount} onChange={onAmountChange} />

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
  nameCard: { paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  submit: {
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: color.textStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
