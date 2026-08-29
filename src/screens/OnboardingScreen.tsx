import React, { useState } from 'react';
import {
  LayoutAnimation,
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
import { Amount, Card, Eyebrow, HeroCard, StatusDot, T, TextField } from '../components/primitives';
import { Chip } from '../components/CategoryChips';
import { tapDone, tapSelect } from '../haptics';
import { euroLabel, figure } from '../format';
import { daysInMonth } from '../time';
import { color, fg, GUTTER, radius, w } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** The same morph the edit sheet and the tab bar use. */
const morph = () =>
  LayoutAnimation.configureNext({
    duration: 280,
    create: { type: 'easeInEaseOut', property: 'opacity' },
    update: { type: 'easeInEaseOut' },
    delete: { type: 'easeInEaseOut', property: 'opacity' },
  });

/* The canvas's slider: 1,500–5,000 in steps of 50, opening at 3,200 — which is
   also what the seven seeded category limits add up to. */
const MIN_CENTS = 150_000;
const MAX_CENTS = 500_000;
const STEP_CENTS = 5_000;
const DEFAULT_CENTS = 320_000;

const EMPLOYMENT = [
  'Student',
  'Employed',
  'Self-employed',
  'Freelance',
  'Apprentice',
  'Between jobs',
  'Retired',
];

const CTAS = ['Get started', 'Continue', 'Continue', 'Open my budget'];

/* The canvas's first footnote promises bank-level encryption; this app has no
   bank connection and stores an unencrypted SQLite file, so it says what is
   actually true instead. */
const FOOTNOTES = [
  'No account needed. Nothing leaves your phone.',
  'Stored on device only',
  'You can change this any month',
  'Everything is editable later',
];

const LAST_STEP = 3;

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

/** 00 — Onboarding: four steps, gated on `sync_meta.onboarded_at`. */
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
  const [trackWidth, setTrackWidth] = useState(0);

  const nameDone = name.trim().length > 1;
  const fraction = (budgetCents - MIN_CENTS) / (MAX_CENTS - MIN_CENTS);
  const perDayCents = Math.round(budgetCents / daysInMonth(Date.now()));

  const go = (next: number) => {
    morph();
    tapSelect();
    setStep(next);
  };

  const finish = () => {
    tapDone();
    onComplete({
      name: name.trim(),
      employment: EMPLOYMENT[employment],
      monthlyBudgetCents: budgetCents,
      keepCategoryIds: [...picked],
      weeklyRecap: recap,
    });
  };

  /** Drag anywhere on the rail; the value snaps to the canvas's 50-unit step. */
  const setFromTouch = (x: number) => {
    if (trackWidth <= 0) return;
    const ratio = Math.min(1, Math.max(0, x / trackWidth));
    const snapped =
      Math.round((MIN_CENTS + ratio * (MAX_CENTS - MIN_CENTS)) / STEP_CENTS) * STEP_CENTS;
    if (snapped !== budgetCents) {
      tapSelect();
      setBudgetCents(snapped);
    }
  };

  const toggleCategory = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View style={styles.fill}>
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
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.pip, i === step ? styles.pipOn : styles.pipOff]} />
          ))}
        </View>
        {/* The canvas's skip jumps to the last step rather than out of the flow,
            so a skipped budget is still the slider's default, never zero. */}
        <Pressable accessibilityRole="button" onPress={() => go(LAST_STEP)} hitSlop={8}>
          <T weight="mono" size={11} tracking={0.1} alpha={0.3}>
            SKIP
          </T>
        </Pressable>
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
              <Eyebrow size={10} tracking={0.18}>Step 1 of 3</Eyebrow>
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
              <View style={styles.nameField}>
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
              </View>
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
              <Eyebrow size={10} tracking={0.18}>Step 2 of 3</Eyebrow>
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

            <HeroCard style={styles.budgetCard}>
              <Eyebrow alpha={0.34}>Monthly budget</Eyebrow>
              <Amount value={figure(budgetCents)} size={50} symbolSize={24} />
              <View style={styles.sliderBlock}>
                <View
                  style={styles.sliderRow}
                  onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={(e) => setFromTouch(e.nativeEvent.locationX)}
                  onResponderMove={(e) => setFromTouch(e.nativeEvent.locationX)}
                >
                  <View style={styles.track} />
                  <View style={[styles.trackFill, { width: `${fraction * 100}%` }]} />
                  <View style={[styles.knob, { left: `${fraction * 100}%` }]} />
                </View>
                <View style={styles.rowBetween}>
                  <T weight="mono" size={10} alpha={0.28}>
                    {euroLabel(MIN_CENTS)}
                  </T>
                  <T weight="mono" size={10} alpha={0.28}>
                    {euroLabel(MAX_CENTS)}
                  </T>
                </View>
              </View>
            </HeroCard>

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
              <Eyebrow size={10} tracking={0.18}>Step 3 of 3</Eyebrow>
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
                We’ll sort the rest automatically. Limits come later.
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
    </View>
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
  progress: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pip: { height: 2, borderRadius: 2, flexGrow: 0, flexShrink: 0 },
  pipOn: { flexBasis: 22, backgroundColor: color.mark },
  pipOff: { flexBasis: 8, backgroundColor: w(0.14) },

  body: { flexGrow: 1, paddingHorizontal: GUTTER },
  step: { flex: 1, gap: 26, paddingTop: 36 },
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

  budgetCard: { paddingVertical: 26, paddingHorizontal: 24, gap: 22, alignItems: 'center' },
  sliderBlock: { width: '100%', gap: 12 },
  sliderRow: { height: 22, justifyContent: 'center' },
  track: { width: '100%', height: 3, borderRadius: 2, backgroundColor: w(0.09) },
  trackFill: { position: 'absolute', left: 0, height: 3, borderRadius: 2, backgroundColor: color.mark },
  knob: {
    position: 'absolute',
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: color.textBright,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
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
