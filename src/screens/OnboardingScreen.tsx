import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import { Card, Eyebrow, FieldSurface, StatusDot, T, TextField } from '../components/primitives';
import { BudgetAmountCard, DEFAULT_CENTS } from '../components/BudgetAmountCard';
import { CategoryLimits, limitCentsOf, type Limits } from '../components/CategoryLimits';
import { Chip } from '../components/CategoryChips';
import { tapDone, tapSelect } from '../haptics';
import { euroLabel } from '../format';
import { morph } from '../motion';
import { daysInMonth } from '../time';
import { color, fg, GUTTER, radius, w } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const EMPLOYMENT = [
  'Student',
  'Employed',
  'Self-employed',
  'Freelance',
  'Apprentice',
  'Between jobs',
  'Retired',
];

const CTAS = ['Get started', 'Continue', 'Continue', 'Continue', 'Open my budget'];

/* The canvas's first footnote promises bank-level encryption; this app has no
   bank connection and stores an unencrypted SQLite file, so it says what is
   actually true instead. */
const FOOTNOTES = [
  'No account needed. Nothing leaves your phone.',
  'Stored on device only',
  'You can change this any month',
  'Everything is editable later',
  'A limit is a guide, not a lock',
];

const LAST_STEP = 4;

function Arrow() {
  return (
    <Svg width={15} height={15} viewBox="0 0 18 18" fill="none">
      <Path
        d="M3.6 9h10.8M10 4.6 14.4 9 10 13.4"
        stroke={color.ink}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Sits in the "type it in" affordance, so the row reads as a control. */
/** 00 — Onboarding: five steps, gated on `sync_meta.onboarded_at`. */
export function OnboardingScreen({
  categories,
  onComplete,
}: {
  categories: { id: string; name: string }[];
  onComplete: (input: {
    name: string;
    employment: string;
    monthlyBudgetCents: number;
    keepCategoryIds: string[];
    /** Only the categories given a figure; a missing one means "no limit". */
    categoryLimitsCents: Record<string, number>;
    weeklyRecap: boolean;
  }) => void;
}) {
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [employment, setEmployment] = useState(1);
  const [budgetCents, setBudgetCents] = useState(DEFAULT_CENTS);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(categories.map((c) => c.id)));
  const [recap, setRecap] = useState(true);
  /** Step 4, keyed by category id and held as typed text so a cleared field stays cleared. */
  const [limits, setLimits] = useState<Limits>({});

  const nameDone = name.trim().length > 1;
  const perDayCents = Math.round(budgetCents / daysInMonth(Date.now()));

  const kept = categories.filter((cat) => picked.has(cat.id));

  const go = (next: number) => {
    morph();
    tapSelect();
    setStep(next);
  };

  const finish = () => {
    tapDone();
    const categoryLimitsCents: Record<string, number> = {};
    for (const cat of kept) {
      // A blank row is "no limit", which is not the same as a limit of zero.
      const cents = limitCentsOf(limits, cat.id);
      if (cents > 0) categoryLimitsCents[cat.id] = cents;
    }
    onComplete({
      name: name.trim(),
      employment: EMPLOYMENT[employment],
      monthlyBudgetCents: budgetCents,
      keepCategoryIds: [...picked],
      categoryLimitsCents,
      weeklyRecap: recap,
    });
  };

  const toggleCategory = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      /* Step 4 is a column of fields; without this the keyboard covers the lower
         rows and the CTA. Android resizes the window on its own. */
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 24) + 2 }]}>
        {step > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => go(step - 1)} style={styles.back}>
            <Svg width={15} height={15} viewBox="0 0 18 18" fill="none">
              <Path
                d="M11 3.6 5.4 9l5.6 5.4"
                stroke={fg(0.7)}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        ) : null}
        <View style={styles.progress}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={[styles.pip, i === step ? styles.pipOn : styles.pipOff]} />
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        /* Without this the first tap after typing is eaten dismissing the keyboard. */
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 ? (
          <View style={styles.welcome}>
            <View style={styles.ringWrap}>
              <View style={styles.rings}>
                <View style={styles.ringOuter} />
                <View style={styles.ringMid} />
                <LinearGradient
                  colors={[w(0.13), w(0.03)]}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={styles.ringCore}
                />
                <T weight="light" size={26} tracking={-0.04} style={{ color: color.textBright }}>
                  €
                </T>
              </View>
            </View>
            <View style={styles.copy}>
              <Eyebrow size={10} tracking={0.18}>Welcome</Eyebrow>
              <T
                weight="light"
                size={34}
                lineHeight={34 * 1.15}
                tracking={-0.035}
                style={{ color: color.textBright }}
              >
                A calmer way to watch your month.
              </T>
              <T size={13.5} lineHeight={13.5 * 1.6} alpha={0.5} style={styles.narrow}>
                One number tells you whether you’re on track. Everything else stays out of the way
                until you ask.
              </T>
            </View>
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.step}>
            <View style={styles.copy}>
              <Eyebrow size={10} tracking={0.18}>Step 1 of 4</Eyebrow>
              <T
                weight="light"
                size={30}
                lineHeight={30 * 1.15}
                tracking={-0.035}
                style={{ color: color.textBright }}
              >
                First, a little about you.
              </T>
              <T size={13} lineHeight={13 * 1.6} alpha={0.48} style={styles.narrow}>
                This shapes the budget we suggest. Nothing leaves your phone.
              </T>
            </View>

            <View style={{ gap: 11 }}>
              <Eyebrow style={styles.label}>Name</Eyebrow>
              <FieldSurface style={styles.nameField}>
                <TextField
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                  maxLength={40}
                  size={15}
                  tracking={-0.01}
                  style={{ flex: 1, color: color.text }}
                />
                {nameDone ? (
                  <View style={styles.check}>
                    <Svg width={11} height={11} viewBox="0 0 12 12" fill="none">
                      <Path
                        d="M2.6 6.3 4.7 8.4 9.4 3.7"
                        stroke={color.ink}
                        strokeWidth={1.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </View>
                ) : null}
              </FieldSurface>
            </View>

            <View style={{ gap: 13 }}>
              <Eyebrow style={styles.label}>Employment</Eyebrow>
              <View style={styles.chips}>
                {EMPLOYMENT.map((label, i) => (
                  <Chip
                    key={label}
                    label={label}
                    on={i === employment}
                    size="md"
                    onPress={() => setEmployment(i)}
                  />
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.step}>
            <View style={styles.copy}>
              <Eyebrow size={10} tracking={0.18}>Step 2 of 4</Eyebrow>
              <T
                weight="light"
                size={30}
                lineHeight={30 * 1.15}
                tracking={-0.035}
                style={{ color: color.textBright }}
              >
                What should a month cost?
              </T>
              {/* The canvas cites the last three months; a first run has none. */}
              <T size={13} lineHeight={13 * 1.6} alpha={0.48} style={styles.narrow}>
                Everything you mean to spend in a month, rent included.
              </T>
            </View>

            <BudgetAmountCard valueCents={budgetCents} onChange={setBudgetCents} />

            <View style={styles.dailyRow}>
              <StatusDot />
              <T size={12.5} lineHeight={12.5 * 1.45} alpha={0.7} style={{ flex: 1 }}>
                About {euroLabel(perDayCents)} a day to stay on track.
              </T>
            </View>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.step}>
            <View style={styles.copy}>
              <Eyebrow size={10} tracking={0.18}>Step 3 of 4</Eyebrow>
              <T
                weight="light"
                size={30}
                lineHeight={30 * 1.15}
                tracking={-0.035}
                style={{ color: color.textBright }}
              >
                Pick the categories you care about.
              </T>
              <T size={13} lineHeight={13 * 1.6} alpha={0.48} style={styles.narrow}>
                We’ll sort the rest automatically. Limits come next.
              </T>
            </View>

            {/* The canvas lists eight invented names; these are the seeded rows the
                rest of the app already computes against. */}
            <View style={styles.chips}>
              {categories.map((cat) => (
                <Chip
                  key={cat.id}
                  label={cat.name}
                  on={picked.has(cat.id)}
                  size="md"
                  onPress={() => toggleCategory(cat.id)}
                />
              ))}
            </View>

            <Card quiet style={styles.recapCard}>
              <View style={{ gap: 4 }}>
                <T size={13} alpha={0.82}>
                  Weekly recap
                </T>
                <T size={11.5} alpha={0.38}>
                  A quiet Sunday summary
                </T>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: recap }}
                onPress={() => {
                  tapSelect();
                  setRecap((on) => !on);
                }}
                style={[
                  styles.toggle,
                  { backgroundColor: recap ? color.textStrong : color.track },
                  recap ? styles.toggleOn : styles.toggleOff,
                ]}
              >
                <View
                  style={[styles.toggleKnob, { backgroundColor: recap ? color.ink : fg(0.45) }]}
                />
              </Pressable>
            </Card>
          </View>
        ) : null}

        {step === 4 ? (
          <View style={styles.step}>
            <View style={styles.copy}>
              <Eyebrow size={10} tracking={0.18}>Step 4 of 4</Eyebrow>
              <T
                weight="light"
                size={30}
                lineHeight={30 * 1.15}
                tracking={-0.035}
                style={{ color: color.textBright }}
              >
                How much for each?
              </T>
              <T size={13} lineHeight={13 * 1.6} alpha={0.48} style={styles.narrow}>
                Divide the {euroLabel(budgetCents)} however you like. Leave one blank and it simply
                has no limit.
              </T>
            </View>

            <CategoryLimits
              categories={kept}
              budgetCents={budgetCents}
              limits={limits}
              onChange={setLimits}
            />
          </View>
        ) : null}
      </ScrollView>

      <BlurView
        intensity={18}
        tint="dark"
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + 14 }]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => (step === LAST_STEP ? finish() : go(step + 1))}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        >
          <T weight="medium" size={13.5} tracking={-0.01} style={{ color: color.ink }}>
            {CTAS[step]}
          </T>
          <Arrow />
        </Pressable>
        <T size={11} lineHeight={11 * 1.4} alpha={0.3} style={{ textAlign: 'center' }}>
          {FOOTNOTES[step]}
        </T>
      </BlurView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: GUTTER,
    paddingBottom: 8,
  },
  back: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: w(0.055),
    borderWidth: 1,
    borderColor: w(0.07),
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pip: { height: 2, borderRadius: 2, flexGrow: 0, flexShrink: 0 },
  pipOn: { flexBasis: 22, backgroundColor: color.mark },
  pipOff: { flexBasis: 8, backgroundColor: w(0.14) },

  body: { flexGrow: 1, paddingHorizontal: GUTTER, paddingBottom: 20 },
  /* flexGrow, never flex: `flex: 1` pins flex-basis to 0, which lets the scroll
     view squeeze the column back down to exactly one screen — step 4's category
     rows then run off the bottom with nothing to scroll. */
  step: { flexGrow: 1, gap: 26, paddingTop: 36 },
  copy: { gap: 12, paddingHorizontal: 4 },
  narrow: { maxWidth: 300 },
  label: { paddingLeft: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingHorizontal: 2 },

  welcome: { flex: 1, paddingBottom: 20 },
  ringWrap: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center' },
  rings: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  ringOuter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: w(0.05),
  },
  ringMid: {
    position: 'absolute',
    top: 34,
    left: 34,
    right: 34,
    bottom: 34,
    borderRadius: 66,
    borderWidth: 1,
    borderColor: w(0.07),
  },
  ringCore: {
    position: 'absolute',
    top: 68,
    left: 68,
    right: 68,
    bottom: 68,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: w(0.08),
  },

  nameField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 54,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: w(0.045),
    borderWidth: 1,
    borderColor: w(0.075),
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.textStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dailyRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 4 },


  recapCard: {
    borderRadius: radius.tile,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggle: { width: 42, height: 25, borderRadius: radius.pill, padding: 2, flexDirection: 'row' },
  toggleOn: { justifyContent: 'flex-end' },
  toggleOff: { justifyContent: 'flex-start' },
  toggleKnob: { width: 21, height: 21, borderRadius: 10.5 },

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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
});
