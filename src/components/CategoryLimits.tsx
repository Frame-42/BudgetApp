import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, Eyebrow, FieldSurface, T, TextField } from './primitives';
import { tapSelect } from '../haptics';
import { euroLabel } from '../format';
import { digits } from './BudgetAmountCard';
import { makeStyles, radius, useTheme } from '../theme';

export type Limits = Record<string, string>;

/** Whole euros as typed; a blank row is no limit, which is not a limit of zero. */
export const limitCentsOf = (limits: Limits, id: string) =>
  (Number.parseInt(limits[id] ?? '', 10) || 0) * 100;

export const assignedCentsOf = (limits: Limits, categories: { id: string }[]) =>
  categories.reduce((sum, category) => sum + limitCentsOf(limits, category.id), 0);

/**
 * A limit per category, with what is left of the overall budget above it.
 * Onboarding's step 4 and the budget editor are the same control.
 *
 * Held as typed text rather than numbers so that a cleared field stays cleared:
 * parsing to 0 on every keystroke would make a half-deleted "150" reappear as
 * "0" under the cursor.
 */
export function CategoryLimits({
  categories,
  budgetCents,
  limits,
  onChange,
}: {
  categories: { id: string; name: string }[];
  budgetCents: number;
  limits: Limits;
  onChange: (next: Limits) => void;
}) {
  const styles = useStyles();
  const { color } = useTheme();
  const assignedCents = assignedCentsOf(limits, categories);
  const leftToAssignCents = budgetCents - assignedCents;

  const setLimit = (id: string, text: string) => onChange({ ...limits, [id]: digits(text) });

  /** The remainder lands on the first row, so the split always totals the budget. */
  const splitEvenly = () => {
    if (categories.length === 0) return;
    tapSelect();
    const euros = Math.round(budgetCents / 100);
    const each = Math.floor(euros / categories.length);
    const rest = euros - each * categories.length;
    const next: Limits = {};
    categories.forEach((category, i) => {
      next[category.id] = String(each + (i === 0 ? rest : 0));
    });
    onChange(next);
  };

  const clearLimits = () => {
    tapSelect();
    onChange({});
  };

  if (categories.length === 0) {
    return (
      <Card quiet style={styles.emptyCard}>
        <T size={13} lineHeight={13 * 1.5} alpha={0.5}>
          No categories yet — the month runs on its overall budget alone.
        </T>
      </Card>
    );
  }

  return (
    <>
      <Card quiet style={styles.assignCard}>
        <View style={styles.assignFigure}>
          <Eyebrow alpha={0.34}>
            {leftToAssignCents < 0 ? 'Over budget' : 'Left to assign'}
          </Eyebrow>
          <T
            weight="light"
            size={26}
            lineHeight={26 * 1.15}
            tracking={-0.03}
            style={{ color: color.textBright }}
          >
            {euroLabel(Math.abs(leftToAssignCents))}
          </T>
        </View>
        <View style={styles.assignActions}>
          <Pressable
            accessibilityRole="button"
            onPress={splitEvenly}
            style={({ pressed }) => [styles.ghostPill, pressed && { opacity: 0.7 }]}
          >
            <T size={11.5} alpha={0.6}>
              Split evenly
            </T>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={clearLimits}
            style={({ pressed }) => [styles.ghostPill, pressed && { opacity: 0.7 }]}
          >
            <T size={11.5} alpha={0.6}>
              Clear
            </T>
          </Pressable>
        </View>
      </Card>

      <View style={styles.limitList}>
        {categories.map((category) => (
          <Card key={category.id} quiet style={styles.limitRow}>
            <T size={13} alpha={0.82} style={{ flex: 1 }}>
              {category.name}
            </T>
            <FieldSurface style={styles.limitField}>
              <TextField
                value={limits[category.id] ?? ''}
                onChangeText={(text) => setLimit(category.id, text)}
                keyboardType="number-pad"
                returnKeyType="done"
                placeholder="—"
                accessibilityLabel={`Monthly limit for ${category.name}, in euros`}
                weight="mono"
                size={14}
                style={styles.limitInput}
              />
              <T size={12} alpha={0.42}>
                €
              </T>
            </FieldSurface>
          </Card>
        ))}
      </View>
    </>
  );
}

const useStyles = makeStyles(({ color, w }) => ({
  assignCard: {
    borderRadius: radius.tile,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  assignFigure: { flex: 1, gap: 5 },
  assignActions: { flexDirection: 'row', gap: 8 },
  ghostPill: {
    height: 30,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: w(0.09),
  },
  limitList: { gap: 9 },
  limitRow: {
    borderRadius: radius.tile,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  limitField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: w(0.045),
    borderWidth: 1,
    borderColor: w(0.075),
  },
  limitInput: { minWidth: 56, textAlign: 'right', color: color.text },
  emptyCard: { borderRadius: radius.tile, padding: 18 },
}));
