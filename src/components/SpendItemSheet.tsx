import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { cardStyle, Eyebrow, FieldSurface, T, TextField } from './primitives';
import { CategoryChips } from './CategoryChips';
import { Keypad } from './Keypad';
import { Sheet } from './Sheet';
import { morph } from '../motion';
import { tapDone, tapSelect, tapWarn } from '../haptics';
import {
  amountLabel,
  centsToAmountInput,
  MAX_MERCHANT_LENGTH,
  parseAmountToCents,
  sanitizeMerchant,
} from '../format';
import { clampMonths, MAX_SPLIT_MONTHS, splitAmounts, type SplitEdit } from '../db/split';
import type { TransactionItem } from '../queries/transactions';
import { addMonthsKeepingDay, MONTH_ABBR } from '../time';
import { color, fg, radius, w } from '../theme';

/** How long an armed Delete waits for its second tap before standing down. */
const ARM_TIMEOUT_MS = 4000;

/** 'SEP 2026' — the ends of a split's span. */
const monthLabel = (ts: number) => {
  const d = new Date(ts);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
};

/** One end of the month stepper. The app's only two glyph buttons. */
function Nudge({
  glyph,
  label,
  enabled,
  onPress,
}: {
  glyph: string;
  label: string;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={() => {
        tapSelect();
        onPress();
      }}
      style={({ pressed }) => [styles.nudge, pressed && styles.actionPressed]}
    >
      <T weight="light" size={19} lineHeight={22} style={{ color: fg(enabled ? 0.72 : 0.18) }}>
        {glyph}
      </T>
    </Pressable>
  );
}

/**
 * How many months the amount is spread over, and what that comes to.
 *
 * The preview runs through `splitAmounts`, the same function the write does, so
 * the figure shown here is the figure that lands in the first month — including
 * the extra cent an uneven division puts there.
 */
function SplitCard({
  months,
  onChange,
  totalCents,
  startAt,
}: {
  months: number;
  onChange: (months: number) => void;
  /** Unsigned: the split is about reach, not direction. */
  totalCents: number;
  startAt: number;
}) {
  const step = (delta: number) => {
    const next = clampMonths(months + delta);
    if (next === months) return;
    /* The caption appears and disappears at the 1/2 boundary; let the card grow
       into it rather than snapping a line of text into existence. */
    if (next === 1 || months === 1) morph();
    onChange(next);
  };

  const perMonth = splitAmounts(totalCents, months)[0];

  return (
    <View style={[cardStyle(true), styles.splitCard]}>
      <View style={styles.splitRow}>
        <Eyebrow>Spread over</Eyebrow>
        <View style={styles.stepper}>
          <Nudge glyph="−" label="Fewer months" enabled={months > 1} onPress={() => step(-1)} />
          <T size={13} tracking={-0.01} style={styles.monthCount}>
            {months === 1 ? '1 month' : `${months} months`}
          </T>
          <Nudge
            glyph="+"
            label="More months"
            enabled={months < MAX_SPLIT_MONTHS}
            onPress={() => step(1)}
          />
        </View>
      </View>

      {months > 1 ? (
        <Eyebrow size={10} tracking={0.06} alpha={0.36}>
          {`${amountLabel(perMonth)} a month · ${monthLabel(startAt)} – ${monthLabel(
            addMonthsKeepingDay(startAt, months - 1),
          )}`}
        </Eyebrow>
      ) : null}
    </View>
  );
}

/**
 * What a held Spend row opens: the two actions, and — without a second modal —
 * the edit form they lead to.
 *
 * The row may be one month of a transaction spread over several. The form edits
 * the *whole* transaction in that case — the total, and how far it reaches — so
 * the amount here is the split's total rather than the part that was held. The
 * head still shows the part, which is what the user tapped.
 */
export function SpendItemSheet({
  item,
  categories,
  onClose,
  onSave,
  onDelete,
}: {
  item: TransactionItem | null;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSave: (input: SplitEdit) => void;
  onDelete: (target: { id: string; splitId: string | null }) => void;
}) {
  const [mode, setMode] = useState<'actions' | 'edit'>('actions');
  const [armed, setArmed] = useState(false);
  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState(1);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState('');
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Each newly held row opens a fresh sheet: actions view, disarmed, reseeded. */
  useEffect(() => {
    if (!item) return;
    setMode('actions');
    setArmed(false);
    setAmount(centsToAmountInput(item.split?.totalCents ?? item.amountCents));
    setMonths(item.split?.count ?? 1);
    setCategoryId(item.categoryId);
    setMerchant(item.merchant);
  }, [item]);

  useEffect(() => {
    if (!armed) return;
    disarm.current = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
    return () => {
      if (disarm.current) clearTimeout(disarm.current);
    };
  }, [armed]);

  if (!item) return null;

  const split = item.split;
  const amountCents = parseAmountToCents(amount);
  const canSave = amountCents > 0;
  /* A split already reaches back to its first month; a plain row starts where
     it happened. Either way this is where a spread begins. */
  const startAt = split?.startAt ?? item.occurredAt;

  const pressDelete = () => {
    if (!armed) {
      tapWarn();
      morph();
      setArmed(true);
      return;
    }
    tapDone();
    onDelete({ id: item.id, splitId: split?.id ?? null });
    onClose();
  };

  const save = () => {
    if (!canSave) return;
    tapDone();
    onSave({
      id: item.id,
      splitId: split?.id ?? null,
      amountCents,
      income: item.income,
      months,
      categoryId,
      merchant: sanitizeMerchant(merchant),
    });
    onClose();
  };

  return (
    <Sheet visible onClose={onClose}>
      <View style={styles.head}>
        <View style={{ gap: 5, flexShrink: 1 }}>
          <T size={16} tracking={-0.01} style={{ color: color.textStrong }} numberOfLines={1}>
            {item.merchant}
          </T>
          <Eyebrow>
            {split ? `${item.category} · part ${split.index + 1} of ${split.count}` : item.category}
          </Eyebrow>
        </View>
        <T size={15} tracking={-0.02} alpha={0.72} style={item.income ? { color: color.accentBright } : undefined}>
          {amountLabel(item.amountCents, { signed: item.income })}
        </T>
      </View>

      {mode === 'actions' ? (
        <View style={{ gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              tapSelect();
              morph();
              setArmed(false);
              setMode('edit');
            }}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <T size={14} style={{ color: color.textStrong }}>
              Edit
            </T>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityHint={armed ? undefined : 'Asks you to confirm before deleting'}
            onPress={pressDelete}
            style={({ pressed }) => [
              styles.action,
              armed && styles.actionArmed,
              pressed && styles.actionPressed,
            ]}
          >
            {/* A part is never deleted alone, so say so before the second tap. */}
            <T size={14} style={{ color: armed ? color.accentBright : color.textStrong }}>
              {armed
                ? split
                  ? `Tap again to delete all ${split.count}`
                  : 'Tap again to delete'
                : 'Delete'}
            </T>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel} hitSlop={8}>
            <T size={12.5} alpha={0.4}>
              Cancel
            </T>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <View style={styles.amountRow}>
            <T
              weight="light"
              size={44}
              lineHeight={44 * 1.15}
              tracking={-0.04}
              style={{ color: color.textBright }}
            >
              {amount === '' ? '0' : amount}
            </T>
            <T weight="light" size={21} lineHeight={21} alpha={0.36}>
              €
            </T>
          </View>

          {/* Income has no category to move it to — the chips would be a lie. */}
          {item.income ? null : (
            <CategoryChips categories={categories} value={categoryId} onChange={setCategoryId} />
          )}

          <SplitCard
            months={months}
            onChange={setMonths}
            totalCents={amountCents}
            startAt={startAt}
          />

          <FieldSurface style={[cardStyle(true), styles.nameCard]}>
            <Eyebrow>For</Eyebrow>
            <TextField
              value={merchant}
              onChangeText={setMerchant}
              maxLength={MAX_MERCHANT_LENGTH}
              placeholder="Quick entry"
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              size={14}
              style={{ color: color.textStrong }}
            />
          </FieldSurface>

          <Keypad value={amount} onChange={setAmount} />

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                morph();
                setMode('actions');
              }}
              style={({ pressed }) => [styles.back, pressed && styles.actionPressed]}
            >
              <T size={13.5} alpha={0.55}>
                Back
              </T>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              disabled={!canSave}
              onPress={save}
              style={({ pressed }) => [
                styles.save,
                !canSave && { opacity: 0.35 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <T weight="medium" size={13.5} tracking={-0.01} style={{ color: color.ink }}>
                Save
              </T>
            </Pressable>
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  nameCard: { paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  splitCard: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  splitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  nudge: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Fixed width, so stepping from 9 to 10 months doesn't shuffle the buttons. */
  monthCount: { minWidth: 74, textAlign: 'center', color: color.textStrong },
  action: {
    height: 52,
    borderRadius: radius.key,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: w(0.045),
    borderWidth: 1,
    borderColor: w(0.055),
  },
  actionArmed: { borderColor: 'rgba(180,196,229,0.4)', backgroundColor: w(0.075) },
  actionPressed: { backgroundColor: w(0.12) },
  cancel: { height: 40, alignItems: 'center', justifyContent: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: {
    height: 50,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: w(0.045),
    borderWidth: 1,
    borderColor: w(0.055),
  },
  save: {
    flex: 1,
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: color.textStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
