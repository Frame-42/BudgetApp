import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Eyebrow, T } from './primitives';
import { CADENCE_WORD } from './RepeatCard';
import { Sheet } from './Sheet';
import { morph } from '../motion';
import { tapDone, tapSelect, tapWarn } from '../haptics';
import { amountLabel } from '../format';
import type { TransactionItem } from '../queries/transactions';
import { makeStyles, radius, useTheme } from '../theme';

/** How long an armed action waits for its second tap before standing down. */
const ARM_TIMEOUT_MS = 4000;

/**
 * What a held Spend row opens: its actions. Edit hands the row to the Add
 * screen, which is the one form for entering and changing a transaction — so
 * the date picker, the split and everything added there later apply to both.
 *
 * The row may be one month of a transaction spread over several. An edit or a
 * delete takes the *whole* transaction in that case; the head still shows the
 * part, which is what the user tapped.
 *
 * A row booked by a schedule that is still running gets a third action, to stop
 * it. Edit and Delete stay about this one occurrence: last month's rent being
 * wrong is not a reason to rewrite next month's, and a skipped occurrence is
 * not a cancelled standing order.
 */
export function SpendItemSheet({
  item,
  onClose,
  onEdit,
  onDelete,
  onStopRecurring,
}: {
  item: TransactionItem | null;
  onClose: () => void;
  onEdit: (item: TransactionItem) => void;
  onDelete: (target: { id: string; splitId: string | null }) => void;
  onStopRecurring: (id: string) => void;
}) {
  const styles = useStyles();
  const { color } = useTheme();
  /* Which action is waiting for its second tap. One at a time: arming one
     stands the other down, so a stray tap never lands on a stale confirmation. */
  const [armed, setArmed] = useState<'delete' | 'stop' | null>(null);
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Each newly held row opens a fresh, disarmed sheet. */
  useEffect(() => {
    if (item) setArmed(null);
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

      <View style={{ gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens it on the Add screen"
          onPress={() => {
            tapSelect();
            onClose();
            onEdit(item);
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
    </Sheet>
  );
}

const useStyles = makeStyles(({ color, w }) => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  action: {
    height: 52,
    borderRadius: radius.key,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: w(0.045),
    borderWidth: 1,
    borderColor: w(0.055),
  },
  actionArmed: { borderColor: color.accentLine, backgroundColor: w(0.075) },
  actionPressed: { backgroundColor: w(0.12) },
  cancel: { height: 40, alignItems: 'center', justifyContent: 'center' },
}));
