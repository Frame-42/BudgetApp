import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { cardStyle, Eyebrow, FieldSurface, T, TextField } from './primitives';
import { CategoryChips } from './CategoryChips';
import { Keypad } from './Keypad';
import { CADENCE_WORD } from './RepeatCard';
import { Sheet } from './Sheet';
import { SplitCard } from './SplitCard';
import { morph } from '../motion';
import { tapDone, tapSelect, tapWarn } from '../haptics';
import {
  amountLabel,
  centsToAmountInput,
  MAX_MERCHANT_LENGTH,
  parseAmountToCents,
  sanitizeMerchant,
} from '../format';
import type { SplitEdit } from '../db/split';
import type { TransactionItem } from '../queries/transactions';
import { color, radius, w } from '../theme';

/** How long an armed action waits for its second tap before standing down. */
const ARM_TIMEOUT_MS = 4000;

/**
 * What a held Spend row opens: the two actions, and — without a second modal —
 * the edit form they lead to.
 *
 * The row may be one month of a transaction spread over several. The form edits
 * the *whole* transaction in that case — the total, and how far it reaches — so
 * the amount here is the split's total rather than the part that was held. The
 * head still shows the part, which is what the user tapped.
 *
 * A row booked by a schedule that is still running gets a third action, to stop
 * it. Edit and Delete stay about this one occurrence: last month's rent being
 * wrong is not a reason to rewrite next month's, and a skipped occurrence is
 * not a cancelled standing order.
 */
export function SpendItemSheet({
  item,
  categories,
  onClose,
  onSave,
  onDelete,
  onStopRecurring,
}: {
  item: TransactionItem | null;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSave: (input: SplitEdit) => void;
  onDelete: (target: { id: string; splitId: string | null }) => void;
  onStopRecurring: (id: string) => void;
}) {
  const [mode, setMode] = useState<'actions' | 'edit'>('actions');
  /* Which action is waiting for its second tap. One at a time: arming one
     stands the other down, so a stray tap never lands on a stale confirmation. */
  const [armed, setArmed] = useState<'delete' | 'stop' | null>(null);
  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState(1);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState('');
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Each newly held row opens a fresh sheet: actions view, disarmed, reseeded. */
  useEffect(() => {
    if (!item) return;
    setMode('actions');
    setArmed(null);
    setAmount(centsToAmountInput(item.split?.totalCents ?? item.amountCents));
    setMonths(item.split?.count ?? 1);
    setCategoryId(item.categoryId);
    setMerchant(item.merchant);
  }, [item]);

  useEffect(() => {
    if (!armed) return;
    disarm.current = setTimeout(() => setArmed(null), ARM_TIMEOUT_MS);
    return () => {
      if (disarm.current) clearTimeout(disarm.current);
    };
  }, [armed]);

  if (!item) return null;

  const split = item.split;
  const recurring = item.recurring;
  const amountCents = parseAmountToCents(amount);
  const canSave = amountCents > 0;
  /* A split already reaches back to its first month; a plain row starts where
     it happened. Either way this is where a spread begins. */
  const startAt = split?.startAt ?? item.occurredAt;

  /** First tap arms, second tap acts. */
  const confirm = (action: 'delete' | 'stop', run: () => void) => {
    if (armed !== action) {
      tapWarn();
      morph();
      setArmed(action);
      return;
    }
    tapDone();
    run();
    onClose();
  };

  const pressDelete = () =>
    confirm('delete', () => onDelete({ id: item.id, splitId: split?.id ?? null }));

  const pressStop = () => {
    if (recurring) confirm('stop', () => onStopRecurring(recurring.id));
  };

  const detail = [
    item.category,
    recurring ? CADENCE_WORD[recurring.cadence] : null,
    split ? `part ${split.index + 1} of ${split.count}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
          <Eyebrow>{detail}</Eyebrow>
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
              setArmed(null);
              setMode('edit');
            }}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <T size={14} style={{ color: color.textStrong }}>
              Edit
            </T>
          </Pressable>

          {recurring ? (
            <Pressable
              accessibilityRole="button"
              accessibilityHint={
                armed === 'stop' ? undefined : 'Asks you to confirm before stopping'
              }
              onPress={pressStop}
              style={({ pressed }) => [
                styles.action,
                armed === 'stop' && styles.actionArmed,
                pressed && styles.actionPressed,
              ]}
            >
              {/* What stopping leaves behind is the question, so answer it here. */}
              <T
                size={14}
                style={{ color: armed === 'stop' ? color.accentBright : color.textStrong }}
              >
                {armed === 'stop' ? 'Tap again to stop · past ones stay' : 'Stop repeating'}
              </T>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityHint={armed === 'delete' ? undefined : 'Asks you to confirm before deleting'}
            onPress={pressDelete}
            style={({ pressed }) => [
              styles.action,
              armed === 'delete' && styles.actionArmed,
              pressed && styles.actionPressed,
            ]}
          >
            {/* A part is never deleted alone, so say so before the second tap. */}
            <T size={14} style={{ color: armed === 'delete' ? color.accentBright : color.textStrong }}>
              {armed === 'delete'
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
