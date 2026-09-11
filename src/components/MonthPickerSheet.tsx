import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Sheet } from './Sheet';
import { Eyebrow, T } from './primitives';
import { CaretIcon } from './Icons';
import { tapSelect } from '../haptics';
import { MONTH_ABBR, monthKey, startOfMonth } from '../time';
import { color, fg, radius, w } from '../theme';

/** One year of months at a time: bounded content, however long the history is. */
export function MonthPickerSheet({
  monthStart,
  monthsWithData,
  onPick,
  onClose,
}: {
  /** The month in view, or null when the list is showing all time. */
  monthStart: number | null;
  /** 'YYYY-MM' keys that hold a transaction. */
  monthsWithData: string[];
  onPick: (monthStart: number) => void;
  onClose: () => void;
}) {
  const years = monthsWithData.map((key) => Number(key.slice(0, 4)));
  return (
    <Sheet visible onClose={onClose}>
      <MonthGrid
        monthStart={monthStart}
        firstYear={years.length ? Math.min(...years) : new Date().getFullYear()}
        isEmpty={(start) => !monthsWithData.includes(monthKey(start))}
        onPick={(start) => {
          onPick(start);
          onClose();
        }}
      />

      <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
        <T size={13} alpha={0.4}>
          Cancel
        </T>
      </Pressable>
    </Sheet>
  );
}

/**
 * The sheet's contents without the sheet: a year stepper over twelve months,
 * nothing after the current month pickable. The day picker shows it in place of
 * its days, since a second sheet can't open over the first.
 */
export function MonthGrid({
  monthStart,
  firstYear,
  isEmpty,
  onPick,
}: {
  monthStart: number | null;
  /** How far back the year stepper goes; null for no limit. */
  firstYear: number | null;
  /** A past month that still can't be picked — Spend's months with nothing in them. */
  isEmpty?: (monthStart: number) => boolean;
  onPick: (monthStart: number) => void;
}) {
  const now = new Date();
  const latestMonth = startOfMonth(now);
  const [year, setYear] = useState(() => new Date(monthStart ?? Date.now()).getFullYear());
  const lastYear = now.getFullYear();
  const selectedKey = monthStart === null ? null : monthKey(monthStart);

  const stepYear = (delta: number) => {
    tapSelect();
    setYear((current) => current + delta);
  };

  return (
    <>
      <View style={styles.head}>
        <Eyebrow alpha={0.3}>Pick a month</Eyebrow>
        <View style={styles.years}>
          <YearStep
            direction="back"
            enabled={firstYear === null || year > firstYear}
            onPress={() => stepYear(-1)}
          />
          <T weight="monoMedium" size={12} tracking={0.04} style={{ color: color.textStrong }}>
            {year}
          </T>
          <YearStep
            direction="forward"
            enabled={year < lastYear}
            onPress={() => stepYear(1)}
          />
        </View>
      </View>

      <View style={styles.grid}>
        {MONTH_ABBR.map((label, month) => {
          const start = startOfMonth(new Date(year, month, 1));
          const future = start > latestMonth;
          const empty = isEmpty?.(start) ?? false;
          const enabled = !future && !empty;
          const on = selectedKey === monthKey(start);
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: !enabled }}
              accessibilityHint={
                enabled ? undefined : future ? 'Future months are unavailable' : 'No transactions in this month'
              }
              disabled={!enabled}
              onPress={() => {
                tapSelect();
                onPick(start);
              }}
              style={[styles.cell, on ? styles.cellOn : enabled ? styles.cellOff : styles.cellDead]}
            >
              <T
                weight={on ? 'monoMedium' : 'mono'}
                size={11.5}
                tracking={0.04}
                style={{ color: on ? color.ink : fg(enabled ? 0.6 : 0.18) }}
              >
                {label}
              </T>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function YearStep({
  direction,
  enabled,
  onPress,
}: {
  direction: 'back' | 'forward';
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction === 'back' ? 'Previous year' : 'Next year'}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [styles.yearStep, pressed && { opacity: 0.6 }]}
    >
      <View style={{ transform: [{ rotate: direction === 'back' ? '90deg' : '-90deg' }] }}>
        <CaretIcon color={fg(enabled ? 0.55 : 0.18)} size={15} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
  },
  years: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 32,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: w(0.05),
    borderWidth: 1,
    borderColor: w(0.07),
  },
  yearStep: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    /* Four to a row, whatever the phone's width. */
    flexBasis: '22%',
    flexGrow: 1,
    height: 42,
    borderRadius: radius.key,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellOn: { backgroundColor: color.textStrong },
  cellOff: { backgroundColor: w(0.05), borderWidth: 1, borderColor: w(0.07) },
  cellDead: { backgroundColor: w(0.02), borderWidth: 1, borderColor: w(0.04) },
  cancel: { height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
});
