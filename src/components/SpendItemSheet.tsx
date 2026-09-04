import React, { useEffect, useRef, useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { Card, Eyebrow, T, TextField } from './primitives';
import { CategoryChips } from './CategoryChips';
import { Keypad } from './Keypad';
import { Sheet } from './Sheet';
import { tapDone, tapSelect, tapWarn } from '../haptics';
import {
  amountLabel,
  centsToAmountInput,
  MAX_MERCHANT_LENGTH,
  parseAmountToCents,
  sanitizeMerchant,
} from '../format';
import type { TransactionItem } from '../queries/transactions';
import { color, radius, w } from '../theme';

/** How long an armed Delete waits for its second tap before standing down. */
const ARM_TIMEOUT_MS = 4000;

/** The same 280ms ease the tab bar uses, so the sheet's morph matches the app. */
const morph = () =>
  LayoutAnimation.configureNext({
    duration: 280,
    create: { type: 'easeInEaseOut', property: 'opacity' },
    update: { type: 'easeInEaseOut' },
    delete: { type: 'easeInEaseOut', property: 'opacity' },
  });

/**
 * What a held Spend row opens: the two actions, and — without a second modal —
 * the edit form they lead to.
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
  onSave: (input: {
    id: string;
    amountCents: number;
    categoryId: string | null;
    income: boolean;
    merchant: string;
  }) => void;
  onDelete: (id: string) => void;
}) {
  const [mode, setMode] = useState<'actions' | 'edit'>('actions');
  const [armed, setArmed] = useState(false);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState('');
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Each newly held row opens a fresh sheet: actions view, disarmed, reseeded. */
  useEffect(() => {
    if (!item) return;
    setMode('actions');
    setArmed(false);
    setAmount(centsToAmountInput(item.amountCents));
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

  const amountCents = parseAmountToCents(amount);
  const canSave = amountCents > 0;

  const pressDelete = () => {
    if (!armed) {
      tapWarn();
      morph();
      setArmed(true);
      return;
    }
    tapDone();
    onDelete(item.id);
    onClose();
  };

  const save = () => {
    if (!canSave) return;
    tapDone();
    onSave({ id: item.id, amountCents, categoryId, income: item.income, merchant: sanitizeMerchant(merchant) });
    onClose();
  };

  return (
    <Sheet visible onClose={onClose}>
      <View style={styles.head}>
        <View style={{ gap: 5, flexShrink: 1 }}>
          <T size={16} tracking={-0.01} style={{ color: color.textStrong }} numberOfLines={1}>
            {item.merchant}
          </T>
          <Eyebrow alpha={0.3}>{item.category}</Eyebrow>
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
            <T size={14} style={{ color: armed ? color.accentBright : color.textStrong }}>
              {armed ? 'Tap again to delete' : 'Delete'}
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

          <Card quiet style={styles.nameCard}>
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
          </Card>

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
