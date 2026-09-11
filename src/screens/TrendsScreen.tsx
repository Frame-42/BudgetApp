import React, { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { TrendPeriodPager } from '../components/TrendPeriodPager';
import { dimAlpha, LegendRule, PaceChart, SplitDonut } from '../components/Charts';
import { BulbIcon, CaretIcon } from '../components/Icons';
import { Amount, Card, Divider, Eyebrow, HeroCard, StatusDot, T } from '../components/primitives';
import {
  TREND_SPANS,
  type Share,
  type TrendSpan,
  type TrendsBundle,
  type TrendsData,
} from '../queries/trends';
import type { Period } from '../state/useTransactionFeed';
import { euroLabel, figure } from '../format';
import { tapSelect } from '../haptics';
import { color, fg, radius, w } from '../theme';


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


/** 04 — Trends: three, six or twelve months of shape, or one month of it. */
export function TrendsScreen({
  data: bundle,
  showHint,
  categoryIds,
  onToggleCategories,
  onClearCategories,
  onPickMonth,
  onSeeTransactions,
  onChangePeriod,
}: {
  data: TrendsBundle;
  onChangePeriod: (offset: number) => void;
  /** The bars have never been used, so the screen still has to say they work. */
  showHint: boolean;
  /** What every figure here is narrowed to; empty means every category. */
  categoryIds: string[];
  onToggleCategories: (ids: string[]) => void;
  onClearCategories: () => void;
  onPickMonth: () => Promise<void>;
  /** Hands this exact scope to the Spend list and goes there. */
  onSeeTransactions: (scope: { period: Period; categoryIds: string[] }) => void;
}) {
  const [span, setSpan] = useState<TrendSpan>(6);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [compareChoice, setCompareChoice] = useState<Compare>('average');
  const data = bundle[span];
  const periodLabel = data.endOffset === 0 ? SPAN_LABEL[span] : data.label;
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
  const narrowed = categoryIds.length > 0;
  const isOn = (share: Share) => share.categoryIds.every((id) => categoryIds.includes(id));
  /* The ring keeps the whole picture rather than redrawing as the selection
     alone: picked arcs keep their own brightness and thicken slightly, the rest
     dim with their legend rows. */
  const ring = narrowed
    ? split.map((share) =>
        isOn(share) ? { ...share, popped: true } : { ...share, alpha: dimAlpha(share.alpha) },
      )
    : split;

  /* What the selection is called, for the lines that have to name it. Shares
     the donut's rollup, so picking "Other" reads as "Other" rather than a list. */
  const chosen = split.filter(isOn);
  const selectionLabel =
    chosen.length === 0
      ? null
      : chosen.length === 1
        ? chosen[0].name
        : chosen.length === 2
          ? `${chosen[0].name} and ${chosen[1].name}`
          : `${chosen.length} categories`;
  const selectionPercent = chosen.reduce((sum, share) => sum + share.percent, 0);
  /* The header has a span switcher beside it, so names only fit one deep. */
  const selectionTag =
    chosen.length === 0
      ? narrowed
        ? `${categoryIds.length} selected`
        : null
      : chosen.length === 1
        ? chosen[0].name
        : `${chosen.length} categories`;

  /* The arcs and their legend rows are the same control drawn twice. */
  const chooseCategories = (ids: string[]) => {
    tapSelect();
    settle();
    onToggleCategories(ids);
  };
  const clearCategories = () => {
    tapSelect();
    settle();
    onClearCategories();
  };

  const matchCount = selected ? selected.matchCount : data.matchCount;
  const handOff = () => {
    tapSelect();
    onSeeTransactions({
      period: selected
        ? { kind: 'month', start: monthStartOf(selected.key) }
        : {
            kind: 'range',
            from: data.from,
            to: data.to,
            label: data.label,
          },
      categoryIds,
    });
  };

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
        <View style={{ gap: 5, flexShrink: 1 }}>
          <Pressable
            accessibilityRole={narrowed ? 'button' : undefined}
            accessibilityLabel={narrowed ? `Clear category filter. ${selectionTag}` : undefined}
            disabled={!narrowed}
            hitSlop={17}
            onPress={clearCategories}
            style={styles.filterClear}
          >
            <Eyebrow size={10} numberOfLines={1} style={{ flexShrink: 1 }}>
              {selectionTag ? `${periodLabel} · ${selectionTag}` : periodLabel}
            </Eyebrow>
            {narrowed ? (
              <Eyebrow size={8} alpha={0.3}>
                Clear
              </Eyebrow>
            ) : null}
          </Pressable>
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
        <View style={styles.hero}>
          <Pressable
            accessibilityRole={selected ? 'button' : undefined}
            accessibilityLabel={selected ? `Back to all ${data.months.length} months` : undefined}
            disabled={!selected}
            onPress={clear}
            style={styles.heroTop}
          >
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
          </Pressable>
          <View style={styles.bars}>
            <TrendPeriodPager
              data={data}
              selectedKey={selectedKey}
              onPick={pick}
              onChangePeriod={(offset) => {
                tapSelect();
                setSelectedKey(null);
                onChangePeriod(offset);
              }}
            />
            {showHint && !justPicked && !selected ? (
              <View style={styles.hint}>
                <BulbIcon color={fg(0.3)} size={11} />
                <Eyebrow size={9} alpha={0.26} tracking={0.18}>
                  Tap a month
                </Eyebrow>
              </View>
            ) : null}
          </View>
        </View>
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
            <SplitDonut shares={ring} onPressShare={(i) => chooseCategories(split[i].categoryIds)}>
              <T weight="light" size={19} lineHeight={19} tracking={-0.03}>
                {figure(selected ? selected.totalCents : data.monthlyAverageCents)} €
              </T>
              <Eyebrow size={8.5} alpha={0.32} tracking={0.12}>
                {selected ? `in ${selected.label}` : data.averageIsPartial ? 'so far' : 'avg / mo'}
              </Eyebrow>
            </SplitDonut>
            <View style={styles.legend}>
              {split.map((share) => {
                const on = isOn(share);
                /* Unselected rows step back rather than disappear: they are how a
                   second category is added to the selection. */
                const dim = narrowed && !on;
                return (
                  <Pressable
                    key={share.name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityHint="Narrows this screen to the category"
                    onPress={() => chooseCategories(share.categoryIds)}
                    style={({ pressed }) => [styles.legendItem, pressed && styles.legendPressed]}
                  >
                    <View
                      style={[
                        styles.swatch,
                        {
                          backgroundColor: `rgba(233,235,242,${dim ? dimAlpha(share.alpha) : share.alpha})`,
                        },
                      ]}
                    />
                    <T size={12.5} alpha={dim ? 0.34 : 0.82} style={{ flex: 1 }}>
                      {share.name}
                    </T>
                    <T weight="mono" size={11} alpha={dim ? 0.2 : 0.42}>
                      {share.percent}%
                    </T>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Card>
      ) : null}

      {leader ? (
        <Card quiet style={styles.insight}>
          <StatusDot />
          <T size={12.5} lineHeight={17.5} alpha={0.72} style={{ flex: 1 }}>
            {/* Narrowed, the leading slice is no longer what the screen is about. */}
            {selectionLabel
              ? selected
                ? `${selectionLabel} took ${selectionPercent}% of what you spent in ${selected.label}.`
                : `${selectionLabel} ${chosen.length > 1 ? 'take' : 'takes'} ${selectionPercent}% of everything you spend.`
              : selected
                ? `${leader.name} took ${leader.percent}% of what you spent in ${selected.label}.`
                : `${leader.name} takes ${leader.percent}% of everything you spend.`}
          </T>
        </Card>
      ) : null}

      {/* Last word on the screen: everything above it is what it hands over. */}
      {matchCount ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens these transactions on the Spend tab"
          onPress={handOff}
          style={({ pressed }) => [pressed && styles.stripPressed]}
        >
          <Card style={styles.strip}>
            <T size={12.5} alpha={0.72}>
              {matchCount === 1 ? 'See 1 transaction' : `See ${matchCount} transactions`}
            </T>
            {/* The app's one caret, turned to point the way it goes. */}
            <View style={{ transform: [{ rotate: '-90deg' }] }}>
              <CaretIcon color={fg(0.4)} size={13} />
            </View>
          </Card>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 'YYYY-MM' back to the first millisecond of that month, for the hand-off. */
function monthStartOf(key: string): number {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).getTime();
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
  filterClear: { flexDirection: 'row', alignItems: 'center', gap: 5 },
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
  paceCard: { padding: 20, gap: 18 },
  paceHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  /* The caret carries the affordance on its own; the label stays an eyebrow like the rest. */
  swap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swapPressed: { opacity: 0.55 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  splitCard: { padding: 20, gap: 18 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  legend: { flex: 1, gap: 9 },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  stripPressed: { opacity: 0.7 },
  legendPressed: { opacity: 0.6 },
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
