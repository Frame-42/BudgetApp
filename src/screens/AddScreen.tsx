import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { cardStyle, Eyebrow, FieldSurface, HeroCard, T, TextField } from '../components/primitives';
import { CategoryChips } from '../components/CategoryChips';
import { DateCard } from '../components/DateCard';
import { Keypad } from '../components/Keypad';
import { CADENCE_WORD, RepeatCard } from '../components/RepeatCard';
import { SplitCard } from '../components/SplitCard';
import { tapSelect } from '../haptics';
import { morph } from '../motion';
import { splitAmounts } from '../db/split';
import type { Cadence } from '../db/types';
import { figure, MAX_MERCHANT_LENGTH, parseAmountToCents } from '../format';
import { occurrenceIndex, onDay } from '../time';
import { color, fg, radius, w } from '../theme';

/**
 * 03 — Add: expense entry.
 *
 * The date, spreading over months and repeating sit behind "Advanced": most
 * entries are a coffee bought just now, and three more cards between the name
 * and the keypad would push the button off the screen for every one of them.
 * Closing the section puts all three back to their defaults rather than hiding
 * them — an option still applying while nobody can see it would be written into
 * the next expense unasked.
 */
export function AddScreen({
  amount,
  onAmountChange,
  merchant,
  onMerchantChange,
  categories,
  categoryId,
  onCategoryChange,
  day,
  onDayChange,
  months,
  onMonthsChange,
  cadence,
  onCadenceChange,
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
  /** The start of the day it happened; null for today. */
  day: number | null;
  onDayChange: (next: number | null) => void;
  /** How far the amount is spread; 1 is not a split. */
  months: number;
  onMonthsChange: (next: number) => void;
  /** Null when it happens once. */
  cadence: Cadence | null;
  onCadenceChange: (next: Cadence | null) => void;
  leftToSpendCents: number;
  daysRemaining: number;
  onSubmit: () => void;
}) {
  /* The screen unmounts on every tab switch while the options live in App, so
     coming back to options already set has to reopen the section they're in. */
  const [advanced, setAdvanced] = useState(
    () => day !== null || months > 1 || cadence !== null,
  );

  const display = amount === '' ? '0' : amount;
  const amountCents = parseAmountToCents(amount);
  const now = Date.now();
  const at = day === null ? now : onDay(day, now);
  /* Only the part that lands in this month counts against what is left: the
     first of a split, a later one when it was back-dated into an earlier month,
     none when every part has already been and gone. */
  const part = occurrenceIndex(at, 'month', now);
  const remainingCents = leftToSpendCents - (splitAmounts(amountCents, months)[part] ?? 0);

  const toggleAdvanced = () => {
    tapSelect();
    morph();
    if (advanced) {
      onDayChange(null);
      onMonthsChange(1);
      onCadenceChange(null);
    }
    setAdvanced(!advanced);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <T size={19} lineHeight={21} tracking={-0.01}>
          New expense
        </T>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: advanced }}
          accessibilityHint={advanced ? 'Closing resets date, split and repeat' : undefined}
          onPress={toggleAdvanced}
          hitSlop={8}
          style={({ pressed }) => [
            styles.toggle,
            advanced ? styles.toggleOn : styles.toggleOff,
            pressed && { opacity: 0.8 },
          ]}
        >
          <T
            size={12}
            weight={advanced ? 'medium' : 'regular'}
            style={{ color: advanced ? color.ink : fg(0.6) }}
          >
            Advanced
          </T>
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

      {advanced ? (
        <>
          <DateCard value={day} onChange={onDayChange} />
          <SplitCard
            months={months}
            onChange={onMonthsChange}
            totalCents={amountCents}
            startAt={at}
          />
          <RepeatCard value={cadence} onChange={onCadenceChange} startAt={at} />
        </>
      ) : null}

      <Keypad value={amount} onChange={onAmountChange} />

      <Pressable
        accessibilityRole="button"
        onPress={onSubmit}
        style={({ pressed }) => [styles.submit, pressed && { opacity: 0.85 }]}
      >
        <T weight="medium" size={13.5} tracking={-0.01} style={{ color: color.ink }}>
          {cadence ? `Add ${CADENCE_WORD[cadence]} expense` : 'Add expense'}
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
  /* The category chip's pill, so the one control in the header reads as a
     sibling of the row below rather than a new kind of button. */
  toggle: {
    height: 30,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: color.textStrong },
  toggleOff: { backgroundColor: w(0.05), borderWidth: 1, borderColor: w(0.07) },
  submit: {
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: color.textStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
