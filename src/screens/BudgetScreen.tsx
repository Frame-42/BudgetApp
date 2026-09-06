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
import { BlurView } from 'expo-blur';
import { Background, Eyebrow, T } from '../components/primitives';
import { BudgetAmountCard, TYPED_MIN_CENTS } from '../components/BudgetAmountCard';
import {
  CategoryLimits,
  assignedCentsOf,
  limitCentsOf,
  type Limits,
} from '../components/CategoryLimits';
import { tapDone, tapSelect } from '../haptics';
import { euroLabel } from '../format';
import { daysInMonth } from '../time';
import { GUTTER, color, radius, w } from '../theme';

export type BudgetDraft = {
  monthlyBudgetCents: number;
  /** Every category shown, 0 where the field was left blank. */
  categoryLimitsCents: Record<string, number>;
};

/**
 * The budget editor: onboarding's step 2 and step 4 on one page, prefilled from
 * what is stored. A full-screen Modal rather than a sheet because it is a form
 * with a column of fields — `Sheet`'s card deliberately does not scroll.
 *
 * It writes the current month only, so limits carry forward from here while past
 * months keep the budget they were actually kept to. The footnote says so.
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
  const insets = useSafeAreaInsets();
  const [amountCents, setAmountCents] = useState(0);
  const [limits, setLimits] = useState<Limits>({});
  /* Measured rather than guessed: the footer floats over the list, and a
     hard-coded inset leaves the last category under it on one device or a gap
     on the next. */
  const [footerHeight, setFooterHeight] = useState(0);

  /* Every open reseeds from what is stored, so an abandoned edit leaves nothing
     behind for the next one to inherit. */
  useEffect(() => {
    if (!visible) return;
    setAmountCents(budgetCents ?? 0);
    const seeded: Limits = {};
    for (const [id, cents] of Object.entries(categoryLimits)) {
      // A zero row means the limit was cleared; it seeds as blank, not as "0".
      if (cents > 0) seeded[id] = String(Math.round(cents / 100));
    }
    setLimits(seeded);
  }, [visible, budgetCents, categoryLimits]);

  if (!visible) return null;

  const canSave = amountCents >= TYPED_MIN_CENTS;
  const assignedCents = assignedCentsOf(limits, categories);
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
    onSave({ monthlyBudgetCents: amountCents, categoryLimitsCents });
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
                From {month} on
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
            keyboardDismissMode="on-drag"
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

          <BlurView
            intensity={18}
            tint="dark"
            onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
            style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + 14 }]}
          >
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
            <T size={11} lineHeight={11 * 1.4} alpha={0.3} style={styles.footnote}>
              {canSave
                ? `${euroLabel(assignedCents)} of ${euroLabel(amountCents)} assigned. Past months keep the budget they had.`
                : `A budget starts at ${euroLabel(TYPED_MIN_CENTS)}.`}
            </T>
          </BlurView>
        </KeyboardAvoidingView>
      </Background>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    paddingTop: 16,
    paddingHorizontal: GUTTER,
    gap: 14,
    backgroundColor: 'rgba(11,12,16,0.72)',
  },
  cta: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: color.textStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footnote: { textAlign: 'center' },
});
