import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { cardStyle, Eyebrow, T } from './primitives';
import { tapSelect } from '../haptics';
import type { Cadence } from '../db/types';
import { occurrenceAt, shortDate } from '../time';
import { makeStyles, radius, useTheme } from '../theme';

/** The adjective for each cadence: 'Add monthly expense', 'HOUSING · MONTHLY'. */
export const CADENCE_WORD: Record<Cadence, string> = {
  week: 'weekly',
  month: 'monthly',
  year: 'yearly',
};

const OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

/** 'Oct 11', or 'Sep 11 2027' when the year is the point. */
const nextLabel = (ts: number, cadence: Cadence) =>
  cadence === 'year' ? `${shortDate(ts)} ${new Date(ts).getFullYear()}` : shortDate(ts);

/**
 * Whether the expense being added comes round again, and how often.
 *
 * The caption names the second occurrence rather than restating the choice:
 * the first is the one being added now, and the date the next lands on — the
 * 31st clamping to a short month, a year rolling over — is the one thing a pill
 * label cannot say.
 */
export function RepeatCard({
  value,
  onChange,
  startAt,
}: {
  value: Cadence | null;
  onChange: (next: Cadence | null) => void;
  /** The first occurrence: the date being added. */
  startAt: number;
}) {
  const styles = useStyles();
  const { color, fg } = useTheme();
  return (
    <View style={[cardStyle(color, true), styles.card]}>
      <View style={styles.head}>
        <Eyebrow>Repeats</Eyebrow>
        {value ? (
          <Eyebrow size={10} tracking={0.06} alpha={0.36}>
            {`Next ${nextLabel(occurrenceAt(startAt, value, 1), value)}`}
          </Eyebrow>
        ) : null}
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel="Repeats" style={styles.options}>
        {OPTIONS.map((option) => {
          const on = option.value === value;
          return (
            <Pressable
              key={option.label}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              onPress={() => {
                tapSelect();
                // A second tap on the active pill is how "never" is chosen —
                // there's no pill for it, so the control has to clear itself.
                onChange(on ? null : option.value);
              }}
              style={[styles.option, on ? styles.optionOn : styles.optionOff]}
            >
              <T
                size={12}
                weight={on ? 'medium' : 'regular'}
                style={{ color: on ? color.ink : fg(0.6) }}
              >
                {option.label}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ color, w }) => ({
  card: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  options: { flexDirection: 'row', gap: 6 },
  /* Equal thirds rather than hugging their labels: pills of different widths
     read as a list of tags, equal ones as one control. */
  option: {
    flex: 1,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionOn: { backgroundColor: color.textStrong },
  optionOff: { backgroundColor: w(0.05), borderWidth: 1, borderColor: w(0.07) },
}));
