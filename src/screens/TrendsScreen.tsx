import React, { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { LegendRule, PaceChart, SplitDonut } from '../components/Charts';
import { BulbIcon, CaretIcon } from '../components/Icons';
import { Amount, Card, Divider, Eyebrow, HeroCard, StatusDot, T } from '../components/primitives';
import { TREND_SPANS, type TrendSpan, type TrendsBundle, type TrendsData } from '../queries/trends';
import { euroLabel, figure } from '../format';
import { tapSelect } from '../haptics';
import { color, fg, radius, w } from '../theme';

/** The plot area the design's month bars are drawn against. */
const BAR_PLOT_HEIGHT = 78;

/** The tab bar's 280ms ease, so the card contents settle the way the app moves. */
const EASE = {
  duration: 280,
  create: { type: 'easeInEaseOut', property: 'opacity' },
  update: { type: 'easeInEaseOut' },
  delete: { type: 'easeInEaseOut', property: 'opacity' },
} as const;

/** What a picked month's pace is read against. */
type Compare = 'average' | 'previous';

/** The switcher's labels: what a span is called, and what fits on its button. */
const SPAN_LABEL: Record<TrendSpan, string> = {
  3: 'Last 3 months',
  6: 'Last 6 months',
  12: 'Last 12 months',
};
const SPAN_CHIP: Record<TrendSpan, string> = { 3: '3M', 6: '6M', 12: '1Y' };

/** Twelve bars only fit by tightening the row and cutting the labels to a letter. */
const DENSE_FROM = 12;

/** 04 — Trends: three, six or twelve months of shape, or one month of it. */
export function TrendsScreen({
  data: bundle,
  showHint,
  onPickMonth,
}: {
  data: TrendsBundle;
  /** The bars have never been used, so the screen still has to say they work. */
  showHint: boolean;
  onPickMonth: () => Promise<void>;
}) {
  const [span, setSpan] = useState<TrendSpan>(6);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [compareChoice, setCompareChoice] = useState<Compare>('average');
  const data = bundle[span];
  const dense = data.months.length >= DENSE_FROM;
  /* The write below settles a beat later; this drops the hint with the animation. */
  const [justPicked, setJustPicked] = useState(false);
  /* Looked up rather than held, so a key that outlives its month falls back on its own. */
  const selected = data.months.find((month) => month.key === selectedKey) ?? null;
  /* Both comparisons need months that were actually recorded; either or both can be
     missing, and in a first month there is nothing to read against at all. */
  const canPrevious = selected?.hasPrevious ?? false;
  const canAverage = selected?.hasAverage ?? false;
  const compare: Compare | null =
    canPrevious && canAverage
      ? compareChoice
      : canPrevious
        ? 'previous'
        : canAverage
          ? 'average'
          : null;
  const split = selected ? selected.split : data.split;
  const leader = split[0];

  /* The legend's row count and the pace line's length both change with the month. */
  const settle = () => LayoutAnimation.configureNext(EASE);

  const pick = (key: string) => {
    tapSelect();
    settle();
    setSelectedKey((current) => (current === key ? null : key));
    if (showHint) {
      setJustPicked(true);
      void onPickMonth();
    }
  };
  const clear = () => {
    tapSelect();
    settle();
    setSelectedKey(null);
  };
  const chooseSpan = (next: TrendSpan) => {
    if (next === span) return;
    tapSelect();
    settle();
    setSpan(next);
    /* A pick belongs to the row it was made in, so a new span starts at rest. */
    setSelectedKey(null);
  };
  const swapCompare = () => {
    tapSelect();
    settle();
    setCompareChoice((current) => (current === 'average' ? 'previous' : 'average'));
  };

  const against = compare === 'average' ? 'AVG' : (selected?.previousLabel ?? '');
  /* At rest the chart is only the average month; a pick draws that month over a comparison. */
  const paceCurrent = selected ? selected.pace.current : data.averagePace;
  const pacePrevious =
    selected && compare ? (compare === 'average' ? selected.pace.average : selected.pace.previous) : [];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ gap: 5 }}>
          <Eyebrow size={10}>{SPAN_LABEL[span]}</Eyebrow>
          <T size={19} lineHeight={21} tracking={-0.01}>
            Trends
          </T>
        </View>
        {/* The one control that changes every figure below it, so it sits above them all. */}
        <View style={styles.spans}>
          {TREND_SPANS.map((option) => {
            const on = option === span;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={SPAN_LABEL[option]}
                onPress={() => chooseSpan(option)}
                style={[styles.span, on && styles.spanOn]}
              >
                <T weight="mono" size={11} alpha={on ? 0.82 : 0.38}>
                  {SPAN_CHIP[option]}
                </T>
              </Pressable>
            );
          })}
        </View>
      </View>

      <HeroCard>
        {/* Anywhere off a bar drops the pick — the card itself is the way back. */}
        <Pressable
          accessibilityRole={selected ? 'button' : undefined}
          accessibilityLabel={selected ? `Back to all ${data.months.length} months` : undefined}
          disabled={!selected}
          onPress={clear}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <View style={{ gap: 8 }}>
              <Eyebrow alpha={0.36}>
                {selected
                  ? selected.active
                    ? `${selected.label} so far`
                    : `${selected.label} spending`
                  : data.averageIsPartial
                    ? 'This month so far'
                    : 'Monthly average'}
              </Eyebrow>
              <Amount
                value={figure(selected ? selected.totalCents : data.monthlyAverageCents)}
                size={40}
                symbolSize={20}
              />
            </View>
            {selected ? (
              selected.deltaVsAveragePercent !== null ? (
                <T size={11.5} style={{ color: color.accentBright, paddingBottom: 5 }}>
                  {selected.deltaVsAveragePercent <= 0 ? '−' : '+'}
                  {Math.abs(selected.deltaVsAveragePercent)}% vs average
                  {/* Says which average, since a running month is only weighed as far as it has got. */}
                  {selected.active ? ' by today' : ''}
                </T>
              ) : null
            ) : data.deltaPercent !== null ? (
              <T size={11.5} style={{ color: color.accentBright, paddingBottom: 5 }}>
                {data.deltaPercent <= 0 ? '−' : '+'}
                {Math.abs(data.deltaPercent)}% vs earlier
              </T>
            ) : null}
          </View>
          <View style={styles.bars}>
            <View style={[styles.monthRow, dense && styles.monthRowDense]}>
              {data.months.map((month) => {
                /* Nothing is lit until a month is picked; then it is the only one. */
                const on = month.key === selectedKey;
                /* Held open in the row so the months stay in step, but with nothing to show. */
                const missing = !month.present;
                return (
                  <Pressable
                    key={month.key}
                    accessibilityRole={missing ? undefined : 'button'}
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={
                      missing
                        ? `${month.label}, nothing recorded`
                        : `${month.label}, ${euroLabel(month.totalCents)}`
                    }
                    accessibilityHint={missing ? undefined : 'Shows this month on its own'}
                    disabled={missing}
                    onPress={() => pick(month.key)}
                    /* The whole column is the target — a quiet month's bar is only 6px tall. */
                    style={[styles.monthCol, dense && styles.monthColDense]}
                  >
                    <View
                      style={[
                        styles.monthBar,
                        {
                          height: Math.max(6, month.fraction * BAR_PLOT_HEIGHT),
                          // With one month picked, the rest step further back than they rest at.
                          backgroundColor: missing
                            ? w(0.04)
                            : on
                              ? color.mark
                              : selected
                                ? w(0.08)
                                : w(0.12),
                        },
                      ]}
                    />
                    <T
                      weight="mono"
                      size={dense ? 9 : 10}
                      alpha={missing ? 0.16 : on ? 0.62 : selected ? 0.24 : 0.3}
                    >
                      {dense ? month.label.charAt(0) : month.label}
                    </T>
                  </Pressable>
                );
              })}
            </View>
            {showHint && !justPicked && !selected ? (
              <View style={styles.hint}>
                <BulbIcon color={fg(0.3)} size={11} />
                <Eyebrow size={9} alpha={0.26} tracking={0.18}>
                  Tap a month
                </Eyebrow>
              </View>
            ) : null}
          </View>
        </Pressable>
      </HeroCard>

      <Card style={styles.paceCard}>
        <View style={styles.paceHeader}>
          {selected ? (
            canPrevious && canAverage ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${selected.label} against ${compare === 'average' ? `the ${data.span}-month average` : selected.previousLabel}`}
                accessibilityHint="Switches the comparison"
                onPress={swapCompare}
                style={({ pressed }) => [styles.swap, pressed && styles.swapPressed]}
              >
                <Eyebrow tracking={0.14}>{`${selected.label} vs ${against}`}</Eyebrow>
                <CaretIcon color={fg(0.4)} size={10} />
              </Pressable>
            ) : (
              /* Only one of the two exists, or neither — so there is nothing to swap to. */
              <Eyebrow tracking={0.14}>
                {compare ? `${selected.label} vs ${against}` : selected.label}
              </Eyebrow>
            )
          ) : (
            <Eyebrow tracking={0.14}>{data.averageIsPartial ? 'This month' : 'Average month'}</Eyebrow>
          )}
          {selected && compare ? (
            <View style={{ gap: 6, alignItems: 'flex-end' }}>
              <View style={styles.legendRow}>
                <LegendRule />
                <T size={10.5} alpha={0.72}>
                  {selected.label}
                </T>
              </View>
              <View style={styles.legendRow}>
                <LegendRule dashed />
                <T size={10.5} alpha={0.42}>
                  {against}
                </T>
              </View>
            </View>
          ) : null}
        </View>
        <PaceChart current={paceCurrent} previous={pacePrevious} />
        <Divider />
        <T size={12.5} lineHeight={17.5} alpha={0.7}>
          {paceLine(data, selected, compare)}
        </T>
      </Card>

      {split.length ? (
        <Card style={styles.splitCard}>
          <Eyebrow tracking={0.14}>Where it goes</Eyebrow>
          <View style={styles.splitRow}>
            <SplitDonut shares={split}>
              <T weight="light" size={19} lineHeight={19} tracking={-0.03}>
                {figure(selected ? selected.totalCents : data.monthlyAverageCents)} €
              </T>
              <Eyebrow size={8.5} alpha={0.32} tracking={0.12}>
                {selected ? `in ${selected.label}` : data.averageIsPartial ? 'so far' : 'avg / mo'}
              </Eyebrow>
            </SplitDonut>
            <View style={styles.legend}>
              {split.map((share) => (
                <View key={share.name} style={styles.legendItem}>
                  <View
                    style={[styles.swatch, { backgroundColor: `rgba(233,235,242,${share.alpha})` }]}
                  />
                  <T size={12.5} alpha={0.82} style={{ flex: 1 }}>
                    {share.name}
                  </T>
                  <T weight="mono" size={11} alpha={0.42}>
                    {share.percent}%
                  </T>
                </View>
              ))}
            </View>
          </View>
        </Card>
      ) : null}

      {leader ? (
        <Card quiet style={styles.insight}>
          <StatusDot />
          <T size={12.5} lineHeight={17.5} alpha={0.72} style={{ flex: 1 }}>
            {selected
              ? `${leader.name} took ${leader.percent}% of what you spent in ${selected.label}.`
              : `${leader.name} takes ${leader.percent}% of everything you spend.`}
          </T>
        </Card>
      ) : null}
    </View>
  );
}

/** The line under the chart: what the average month costs, or how one month sits against it. */
function paceLine(
  data: TrendsData,
  month: TrendsData['months'][number] | null,
  compare: Compare | null,
): string {
  if (!month) {
    // Before a month has finished the figure above is this month so far, not an average.
    if (data.averageIsPartial) {
      return data.monthlyAverageCents === 0
        ? 'Nothing spent yet this month.'
        : `This month is at ${euroLabel(data.monthlyAverageCents)} so far — about ${euroLabel(
            data.averageDailyCents,
          )} a day.`;
    }
    return `An average month lands at ${euroLabel(data.monthlyAverageCents)} — about ${euroLabel(
      data.averageDailyCents,
    )} a day.`;
  }
  if (month.totalCents === 0) {
    return month.active ? 'Nothing spent yet this month.' : `Nothing spent in ${month.label}.`;
  }
  // A first month has no finished month behind it to be weighed against.
  if (!compare) {
    return month.active
      ? `${month.label} is at ${euroLabel(month.totalCents)} so far.`
      : `${month.label} came to ${euroLabel(month.totalCents)}.`;
  }
  // A month still running is only ever compared as far as it has got.
  const against =
    compare === 'average'
      ? month.active
        ? 'an average month by today'
        : 'an average month'
      : month.active
        ? 'the same day last month'
        : month.previousLabel;
  const delta = compare === 'average' ? month.paceDeltaCents.average : month.paceDeltaCents.previous;
  if (delta === 0) return `Dead level with ${against}.`;
  return delta > 0
    ? `${euroLabel(delta)} lighter than ${against}.`
    : `${euroLabel(-delta)} heavier than ${against}.`;
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 10,
  },
  spans: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: w(0.05),
    borderWidth: 1,
    borderColor: w(0.07),
  },
  span: {
    minWidth: 38,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spanOn: { backgroundColor: w(0.1) },
  hero: { padding: 22, gap: 22 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  bars: { gap: 10 },
  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  monthRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, height: 96 },
  monthRowDense: { gap: 4 },
  monthCol: { flex: 1, alignItems: 'center', gap: 9 },
  monthColDense: { gap: 7 },
  monthBar: { width: '100%', borderRadius: 5 },
  paceCard: { padding: 20, gap: 18 },
  paceHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  /* The caret carries the affordance on its own; the label stays an eyebrow like the rest. */
  swap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swapPressed: { opacity: 0.55 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  splitCard: { padding: 20, gap: 18 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  legend: { flex: 1, gap: 11 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  swatch: { width: 7, height: 7, borderRadius: 2 },
  insight: {
    borderRadius: radius.tile,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
});
