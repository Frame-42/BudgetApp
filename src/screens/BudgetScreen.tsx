import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Background, Eyebrow, T } from '../components/primitives';
import { BudgetAmountCard, TYPED_MIN_CENTS } from '../components/BudgetAmountCard';
import { SegmentedPill } from '../components/SegmentedPill';
import { CategoryLimits, limitCentsOf, type Limits } from '../components/CategoryLimits';
import { tapDone, tapSelect } from '../haptics';
import { euroLabel } from '../format';
import { daysInMonth } from '../time';
import type { BudgetScope } from '../db/budget';
import { GUTTER, makeStyles, radius, useTheme } from '../theme';

export type BudgetDraft = {
  monthlyBudgetCents: number;
  /** Every category shown, 0 where the field was left blank. */
  categoryLimitsCents: Record<string, number>;
  /** Whether the edit stands from now on, or applies to this month alone. */
  scope: BudgetScope;
};

const SCOPES = [
  { value: 'recurring', label: 'Recurring' },
  { value: 'month', label: 'This month only' },
] as const satisfies readonly { value: BudgetScope; label: string }[];

/**
 * The budget editor: onboarding's step 2 and step 4 on one page, prefilled from
 * what is stored. A full-screen Modal rather than a sheet because it is a form
 * with a column of fields — `Sheet`'s card deliberately does not scroll.
 *
 * It never writes a past month, so those keep the budget they were actually kept
 * to. What it does to the *future* is the one thing the user chooses: `recurring`
 * carries forward from here, `month` is a one-off that next month undoes. That
 * choice sits with the CTA rather than at the top of the form, because it is
 * part of saving rather than part of the figures; the eyebrow restates it, since
 * the difference is invisible until the month turns over.
 */
export function BudgetScreen({
  visible,
  categories,
  budgetCents,
  categoryLimits,
  onClose,
  onSave,
}: {
  visible: boolean;
  categories: { id: string; name: string }[];
  /** The overall budget in force, or null when none has ever been set. */
  budgetCents: number | null;
  /** Cents per category id, including limits carried forward from earlier months. */
  categoryLimits: Record<string, number>;
  onClose: () => void;
  onSave: (draft: BudgetDraft) => void;
}) {
  const styles = useStyles();
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const [amountCents, setAmountCents] = useState(0);
  const [limits, setLimits] = useState<Limits>({});
  const [scope, setScope] = useState<BudgetScope>('recurring');
  /* Measured rather than guessed: the footer floats over the list, and a
     hard-coded inset leaves the last category under it on one device or a gap
     on the next. */
  const [footerHeight, setFooterHeight] = useState(0);

  /* Every open reseeds from what is stored, so an abandoned edit leaves nothing
     behind for the next one to inherit. */
  useEffect(() => {
    if (!visible) return;
    setAmountCents(budgetCents ?? 0);
    // The standing budget is the ordinary edit; a one-off is asked for each time.
    setScope('recurring');
    const seeded: Limits = {};
    for (const [id, cents] of Object.entries(categoryLimits)) {
      // A zero row means the limit was cleared; it seeds as blank, not as "0".
      if (cents > 0) seeded[id] = String(Math.round(cents / 100));
    }
    setLimits(seeded);
  }, [visible, budgetCents, categoryLimits]);

  if (!visible) return null;

  const canSave = amountCents >= TYPED_MIN_CENTS;
  const perDayCents = Math.round(amountCents / daysInMonth(Date.now()));
  const month = new Date().toLocaleString('en-US', { month: 'long' });

  const save = () => {
    if (!canSave) return;
    tapDone();
    const categoryLimitsCents: Record<string, number> = {};
    // Every category, blanks included: a blank has to travel as 0 so the writer
    // can clear a limit that would otherwise carry forward from an earlier month.
    for (const category of categories) {
      categoryLimitsCents[category.id] = limitCentsOf(limits, category.id);
    }
    onSave({ monthlyBudgetCents: amountCents, categoryLimitsCents, scope });
    onClose();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <Background>
        <KeyboardAvoidingView
          style={styles.fill}
          /* A column of number fields; without this the keyboard covers the
             lower rows and the CTA. Android resizes the window on its own. */
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.header, { paddingTop: Math.max(insets.top, 24) + 6 }]}>
            <View style={{ gap: 5, flex: 1 }}>
              <Eyebrow size={10} tracking={0.18}>
                {scope === 'recurring' ? `From ${month} on` : `${month} only`}
              </Eyebrow>
              <T
                weight="light"
                size={26}
                lineHeight={26 * 1.15}
                tracking={-0.03}
                style={{ color: color.textBright }}
              >
                Budget
              </T>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => {
                tapSelect();
                onClose();
              }}
              hitSlop={10}
              style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}
            >
              <T size={12.5} alpha={0.55}>
                Cancel
              </T>
            </Pressable>
          </View>

          <ScrollView
            style={styles.fill}
            contentContainerStyle={[styles.content, { paddingBottom: footerHeight + 24 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            /* No dismiss on drag: a field closes when something else is tapped
               or on Done, never because the page was scrolled to look at it. */
          >
            <BudgetAmountCard valueCents={amountCents} onChange={setAmountCents} />

            <T size={12.5} lineHeight={12.5 * 1.5} alpha={0.48} style={styles.lede}>
              About {euroLabel(perDayCents)} a day. Divide it however you like below — leave one
              blank and it simply has no limit.
            </T>

            <CategoryLimits
              categories={categories}
              budgetCents={amountCents}
              limits={limits}
              onChange={setLimits}
            />
          </ScrollView>

          {/* Floating, like the tab bar: no bar behind it, the list running on
              underneath. `box-none` keeps the gap between the two controls a
              hole rather than a lid over the last category row. */}
          <View
            pointerEvents="box-none"
            onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
            style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}
          >
            <SegmentedPill
              accessibilityLabel="How long this budget applies"
              options={SCOPES}
              value={scope}
              onChange={setScope}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              disabled={!canSave}
              onPress={save}
              style={({ pressed }) => [
                styles.cta,
                !canSave && { opacity: 0.35 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <T weight="medium" size={13.5} tracking={-0.01} style={{ color: color.ink }}>
                Save budget
              </T>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Background>
    </Modal>
  );
}

const useStyles = makeStyles(({ color, w }) => ({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
    paddingHorizontal: GUTTER,
    paddingBottom: 16,
  },
  cancel: {
    height: 34,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: w(0.09),
  },
  content: { paddingHorizontal: GUTTER, gap: 14 },
  lede: { paddingHorizontal: 2 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: GUTTER,
    gap: 10,
  },
  cta: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: color.textStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
