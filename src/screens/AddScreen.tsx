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
import { partInMonth } from '../db/split';
import type { Cadence } from '../db/types';
import { figure, MAX_MERCHANT_LENGTH, parseAmountToCents } from '../format';
import { onDay } from '../time';
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
 *
 * It is also where a transaction is edited: Spend's Edit lands here with the
 * form filled in. The defaults are then the transaction's own values, so
 * closing "Advanced" undoes changes rather than clearing what was there, and
 * Repeats is hidden — an edit is about this one occurrence, and stopping a
 * schedule is Spend's to offer.
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
  defaults,
  editing,
  leftToSpendCents,
  daysRemaining,
  onSubmit,
  onCancel,
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
  /** What closing "Advanced" puts the options back to. */
  defaults: { day: number | null; months: number; cadence: Cadence | null };
  /** Set while an existing transaction is being edited. */
  editing: {
    income: boolean;
    /** Its part in this month as it stands, already inside `leftToSpendCents`. */
    replacesCents: number;
  } | null;
  leftToSpendCents: number;
  daysRemaining: number;
  onSubmit: () => void;
  /** Leaves an edit without saving; unused when adding. */
  onCancel: () => void;
}) {
  /* Always starts closed, even onto options already set — an edit's date, a
     draft's split. They still apply while hidden; only closing the section
     puts them back. */
  const [advanced, setAdvanced] = useState(false);

  const display = amount === '' ? '0' : amount;
  const amountCents = parseAmountToCents(amount);
  const now = Date.now();
  const at = day === null ? now : onDay(day, now);
  /* Only the part that lands in this month counts against what is left: the
     first of a split, a later one when it was back-dated into an earlier month,
     none when every part has already been and gone. An edit trades its old part
     for its new one. */
  const remainingCents =
    leftToSpendCents + (editing?.replacesCents ?? 0) - partInMonth(amountCents, months, at, now);

  const toggleAdvanced = () => {
    tapSelect();
    morph();
    if (advanced) {
      onDayChange(defaults.day);
      onMonthsChange(defaults.months);
      onCadenceChange(defaults.cadence);
    }
    setAdvanced(!advanced);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <T size={19} lineHeight={21} tracking={-0.01}>
          {editing ? (editing.income ? 'Edit income' : 'Edit expense') : 'New expense'}
        </T>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: advanced }}
          accessibilityHint={
            advanced ? (editing ? 'Closing undoes date and split changes' : 'Closing resets date, split and repeat') : undefined
          }
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
        {/* Income isn't spending, so it has nothing to say about what is left. */}
        {editing?.income ? null : (
          <T size={11.5} alpha={0.38}>
            Leaves {figure(remainingCents)} € for {daysRemaining} days
          </T>
        )}
      </HeroCard>

      {/* Income has no category to move it to — the chips would be a lie. */}
      {editing?.income ? null : (
        <CategoryChips categories={categories} value={categoryId} onChange={onCategoryChange} />
      )}

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
          {editing ? null : (
            <RepeatCard value={cadence} onChange={onCadenceChange} startAt={at} />
          )}
        </>
      ) : null}

      <Keypad value={amount} onChange={onAmountChange} />

      <View style={styles.footer}>
        {editing ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              tapSelect();
              onCancel();
            }}
            style={({ pressed }) => [styles.cancel, pressed && { backgroundColor: w(0.12) }]}
          >
            <T size={13.5} alpha={0.55}>
              Cancel
            </T>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onSubmit}
          style={({ pressed }) => [styles.submit, pressed && { opacity: 0.85 }]}
        >
          <T weight="medium" size={13.5} tracking={-0.01} style={{ color: color.ink }}>
            {editing ? 'Save' : cadence ? `Add ${CADENCE_WORD[cadence]} expense` : 'Add expense'}
          </T>
        </Pressable>
      </View>
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
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cancel: {
    height: 50,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: w(0.045),
    borderWidth: 1,
    borderColor: w(0.055),
  },
  submit: {
    flex: 1,
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: color.textStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
