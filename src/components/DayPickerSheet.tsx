import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Sheet } from './Sheet';
import { Eyebrow, T } from './primitives';
import { MonthGrid } from './MonthPickerSheet';
import { Choice, MonthStepper, monthLabel, usePillStyles } from './MonthStepper';
import { tapSelect } from '../haptics';
import { morph } from '../motion';
import { addMonths, calendarCells, startOfDay, startOfMonth } from '../time';
import { makeStyles, useTheme } from '../theme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * One month of days at a time, for back-dating an expense. Nothing after today
 * is pickable: a future row would be spending the app counts before it happens,
 * and Spend's own stepper stops at the current month, so it couldn't be found
 * again to correct.
 *
 * The month is chosen with Spend's own control — carets, a swipeable label,
 * and a tap that opens onto choices — so moving through months works the same
 * in both places. "Pick month" swaps the days for the month grid in place,
 * because a second sheet can't open over this one; "Today" stands where Spend
 * has "All time", as the way straight back to the default.
 */
export function DayPickerSheet({
  value,
  onPick,
  onClose,
}: {
  /** The start of the picked day. */
  value: number;
  onPick: (day: number) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const pillStyles = usePillStyles();
  const { color, fg } = useTheme();
  const today = startOfDay(Date.now());
  const latestMonth = startOfMonth(today);
  const [month, setMonth] = useState(() => startOfMonth(value));
  /* The pill's two shapes, as on Spend, plus the month grid it can open. */
  const [mode, setMode] = useState<'days' | 'choices' | 'months'>('days');

  const cells = calendarCells(month);
  /* Padded to whole weeks so every row divides into the same seven columns. */
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const pick = (day: number) => {
    onPick(day);
    onClose();
  };

  const showMode = (next: typeof mode) => {
    morph();
    setMode(next);
  };

  return (
    <Sheet visible onClose={onClose}>
      {mode === 'months' ? (
        <>
          <MonthGrid
            monthStart={month}
            firstYear={null}
            onPick={(start) => {
              setMonth(start);
              showMode('days');
            }}
          />
          <Pressable accessibilityRole="button" onPress={() => showMode('days')} style={styles.cancel}>
            <T size={13} alpha={0.4}>
              Back
            </T>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.head}>
            <Eyebrow alpha={0.3} style={mode === 'choices' ? { display: 'none' } : undefined}>
              Pick a day
            </Eyebrow>
            <View style={[pillStyles.pill, mode === 'choices' && pillStyles.open]}>
              {mode === 'choices' ? (
                <>
                  <Choice label="Cancel" alpha={0.38} onPress={() => showMode('days')} />
                  <Choice label="Pick month" onPress={() => showMode('months')} />
                  <Choice label="Today" on={value === today} onPress={() => pick(today)} />
                </>
              ) : (
                <MonthStepper
                  label={monthLabel(month)}
                  month={month}
                  /* No floor: an expense can be entered however long after it. */
                  canStepBack
                  canStepForward={month < latestMonth}
                  onStep={(delta) =>
                    setMonth((current) => Math.min(addMonths(current, delta), latestMonth))
                  }
                  onPress={() => {
                    tapSelect();
                    showMode('choices');
                  }}
                />
              )}
            </View>
          </View>

          <View style={styles.row}>
            {WEEKDAYS.map((label, i) => (
              <View key={i} style={styles.weekday}>
                <Eyebrow size={9.5} tracking={0.08} alpha={0.28}>
                  {label}
                </Eyebrow>
              </View>
            ))}
          </View>

          <View style={styles.grid}>
            {weeks.map((week, i) => (
              <View key={i} style={styles.row}>
                {week.map((day, j) => {
                  if (day === null) return <View key={j} style={styles.cell} />;
                  const future = day > today;
                  const on = day === value;
                  const isToday = day === today;
                  return (
                    <Pressable
                      key={j}
                      accessibilityRole="button"
                      accessibilityLabel={new Date(day).toDateString()}
                      accessibilityState={{ selected: on, disabled: future }}
                      disabled={future}
                      onPress={() => {
                        tapSelect();
                        pick(day);
                      }}
                      style={({ pressed }) => [
                        styles.cell,
                        on ? styles.cellOn : isToday ? styles.cellToday : null,
                        pressed && !on && styles.cellPressed,
                      ]}
                    >
                      <T
                        weight={on ? 'monoMedium' : 'mono'}
                        size={12.5}
                        style={{ color: on ? color.ink : fg(future ? 0.16 : 0.7) }}
                      >
                        {new Date(day).getDate()}
                      </T>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
            <T size={13} alpha={0.4}>
              Cancel
            </T>
          </Pressable>
        </>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles(({ color, w }) => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 16,
  },
  grid: { gap: 4, paddingTop: 6 },
  row: { flexDirection: 'row', gap: 4 },
  weekday: { flex: 1, alignItems: 'center', paddingBottom: 4 },
  cell: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellOn: { backgroundColor: color.textStrong },
  /* A ring rather than a fill: today is a landmark, not a choice. */
  cellToday: { borderWidth: 1, borderColor: w(0.16) },
  cellPressed: { backgroundColor: w(0.08) },
  cancel: { height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
}));
