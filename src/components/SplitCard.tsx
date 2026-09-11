import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { cardStyle, Eyebrow, T } from './primitives';
import { morph } from '../motion';
import { tapSelect } from '../haptics';
import { amountLabel } from '../format';
import { clampMonths, MAX_SPLIT_MONTHS, splitAmounts } from '../db/split';
import { addMonthsKeepingDay, MONTH_ABBR } from '../time';
import { color, fg, radius, w } from '../theme';

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
      style={({ pressed }) => [styles.nudge, pressed && styles.pressed]}
    >
      <T weight="light" size={19} lineHeight={22} style={{ color: fg(enabled ? 0.72 : 0.18) }}>
        {glyph}
      </T>
    </Pressable>
  );
}

/**
 * How many months the amount is spread over, and what that comes to. One of the
 * Add screen's advanced options — and Add is also where a transaction is
 * edited, so a split is entered and changed through the same control.
 *
 * The preview runs through `splitAmounts`, the same function the write does, so
 * the figure shown here is the figure that lands in the first month — including
 * the extra cent an uneven division puts there.
 */
export function SplitCard({
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
    <View style={[cardStyle(true), styles.card]}>
      <View style={styles.row}>
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

const styles = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  nudge: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: w(0.12) },
  /* Fixed width, so stepping from 9 to 10 months doesn't shuffle the buttons. */
  monthCount: { minWidth: 74, textAlign: 'center', color: color.textStrong },
});
