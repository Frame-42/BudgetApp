import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { T } from './primitives';
import { tapSelect } from '../haptics';
import { morph } from '../motion';
import { makeStyles, radius, useTheme } from '../theme';

/** One pill. Split out so onboarding can build a multi-select row from the same
 *  shape without bending this file's single-select contract. */
export function Chip({
  label,
  on,
  onPress,
  size = 'sm',
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  /** Onboarding draws the same pill a size up; the tab screens stay at 'sm'. */
  size?: 'sm' | 'md';
}) {
  const styles = useStyles();
  const { color, fg } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        tapSelect();
        onPress();
      }}
      style={[styles.chip, size === 'md' && styles.chipMd, on ? styles.chipOn : styles.chipOff]}
    >
      <T
        size={size === 'md' ? 12.5 : 12}
        weight={on ? 'medium' : 'regular'}
        style={on ? { color: color.ink } : { color: fg(size === 'md' ? 0.58 : 0.6) }}
      >
        {label}
      </T>
    </Pressable>
  );
}

/**
 * How many chips stand before the row folds. Six fills two rows at these widths,
 * and `loadAddOptions` sorts by recent use, so it is nearly always the six you
 * want.
 */
const COLLAPSED = 6;

/**
 * The category selector, shared by the Add screen and the edit sheet.
 *
 * Ten categories wrap to three rows, which pushed the keypad down and read as
 * clutter — so past a certain count the tail folds behind a "More" chip. Folding
 * is skipped when it would hide one chip or none, since a "More · 1" saves no
 * space and costs a tap.
 */
export function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: { id: string; name: string }[];
  value: string | null;
  onChange: (next: string) => void;
}) {
  const styles = useStyles();
  const { fg } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const folds = categories.length > COLLAPSED + 1;

  let visible = categories;
  if (folds && !expanded) {
    visible = categories.slice(0, COLLAPSED);
    // A selection from the tail takes the last visible slot rather than
    // disappearing: the sheet opens on whatever a transaction already is, and a
    // selector that can't show its own value is a bug in every other screen.
    const selected = categories.find((cat) => cat.id === value);
    if (selected && !visible.includes(selected)) {
      visible = [...visible.slice(0, COLLAPSED - 1), selected];
    }
  }

  const toggle = () => {
    tapSelect();
    morph();
    setExpanded(!expanded);
  };

  return (
    <View style={styles.chips}>
      {visible.map((cat) => (
        <Chip
          key={cat.id}
          label={cat.name}
          on={cat.id === value}
          onPress={() => onChange(cat.id)}
        />
      ))}
      {folds ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? 'Show fewer categories' : 'Show all categories'}
          onPress={toggle}
          style={[styles.chip, styles.chipMore]}
        >
          <T size={12} style={{ color: fg(0.45) }}>
            {expanded ? 'Less' : `More · ${categories.length - visible.length}`}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ color, w }) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 2 },
  chip: {
    height: 34,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipMd: { height: 38, paddingHorizontal: 17 },
  chipOn: { backgroundColor: color.textStrong },
  chipOff: { backgroundColor: w(0.05), borderWidth: 1, borderColor: w(0.07) },
  /* Unfilled, so it reads as a control rather than an eleventh category. */
  chipMore: { borderWidth: 1, borderColor: w(0.07), borderStyle: 'dashed' },
}));
