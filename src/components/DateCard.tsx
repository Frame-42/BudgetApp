import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { cardStyle, Eyebrow, T } from './primitives';
import { CaretIcon } from './Icons';
import { DayPickerSheet } from './DayPickerSheet';
import { tapSelect } from '../haptics';
import { dayLabel, startOfDay } from '../time';
import { makeStyles, useTheme } from '../theme';

/** 'Today', 'Yesterday', 'Tue 25 Aug' — and the year once it isn't this one. */
const label = (day: number, now: number) => {
  const year = new Date(day).getFullYear();
  const base = dayLabel(day, now);
  return year === new Date(now).getFullYear() ? base : `${base} ${year}`;
};

/**
 * The day an expense happened, for entering one after the fact. First in Add's
 * advanced options because the split and the repeat are both measured from it.
 *
 * `null` means today rather than a stored midnight, so an entry started before
 * midnight and saved after it still lands on the day it was saved.
 */
export function DateCard({
  value,
  onChange,
}: {
  /** The start of the picked day; null for today. */
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const styles = useStyles();
  const { color, fg } = useTheme();
  const [picking, setPicking] = useState(false);
  const now = Date.now();
  const day = value ?? startOfDay(now);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Date, ${label(day, now)}`}
        accessibilityHint="Opens a calendar"
        onPress={() => {
          tapSelect();
          setPicking(true);
        }}
        style={({ pressed }) => [cardStyle(color, true), styles.card, pressed && { opacity: 0.8 }]}
      >
        <Eyebrow>Date</Eyebrow>
        <View style={styles.value}>
          <T size={13} tracking={-0.01} style={{ color: color.textStrong }}>
            {label(day, now)}
          </T>
          <CaretIcon color={fg(0.4)} size={14} />
        </View>
      </Pressable>

      {picking ? (
        <DayPickerSheet
          value={day}
          onPick={(next) => onChange(next === startOfDay(Date.now()) ? null : next)}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  );
}

const useStyles = makeStyles(() => ({
  /* The split card's row height, so the three options read as one stack. */
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 54,
  },
  value: { flexDirection: 'row', alignItems: 'center', gap: 6 },
}));
