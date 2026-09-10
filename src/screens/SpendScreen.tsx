import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutAnimation, PanResponder, Pressable, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { Amount, Card, Eyebrow, FieldSurface, HeroCard, T, TextField } from '../components/primitives';
import { Chip } from '../components/CategoryChips';
import { CaretIcon, SearchIcon } from '../components/Icons';
import { TransactionRow } from '../components/TransactionRow';
import { SpendItemSheet } from '../components/SpendItemSheet';
import { MonthPickerSheet } from '../components/MonthPickerSheet';
import { tapSelect } from '../haptics';
import type { SplitEdit, SplitTarget } from '../db/split';
import type { TransactionItem } from '../queries/transactions';
import type { Period, TransactionFeed } from '../state/useTransactionFeed';
import { figure } from '../format';
import { addMonths, MONTH_ABBR, startOfMonth } from '../time';
import { GUTTER, color, fg, radius, w } from '../theme';

/** The same 280ms ease the tab bar uses, so the pill's morph matches the app. */
const morph = () =>
  LayoutAnimation.configureNext({
    duration: 280,
    create: { type: 'easeInEaseOut', property: 'opacity' },
    update: { type: 'easeInEaseOut' },
    delete: { type: 'easeInEaseOut', property: 'opacity' },
  });

/** 'SEP 2026' / 'LAST 6 MONTHS' / 'ALL TIME' — whatever the list is scoped to. */
const periodLabel = (period: Period) => {
  if (period.kind === 'all') return 'All time';
  if (period.kind === 'range') return period.label;
  const d = new Date(period.start);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
};

/** Adjacent labels travel with the finger before the selected period changes. */
function SwipePeriod({ feed, onPress, swiping, onSwipingChange }: {
  feed: TransactionFeed;
  onPress: () => void;
  swiping: boolean;
  onSwipingChange: (swiping: boolean) => void;
}) {
  const { period, canStepBack, canStepForward } = feed;
  const offset = useRef(new Animated.Value(0)).current;
  const settling = useRef(false);
  const dragStart = useRef(0);
  const pendingMonth = useRef<number | null>(null);
  const continuation = useRef<{ month: number; offset: number } | null>(null);
  const chained = useRef(false);
  const [width, setWidth] = useState(0);
  const pageWidth = width + 2 * (26 + 4);
  const settle = useCallback((toValue: number, velocity = 0) => Animated.spring(offset, {
    toValue, velocity, stiffness: 280, damping: 32, mass: 0.8,
    overshootClamping: true, restDisplacementThreshold: 0.1, restSpeedThreshold: 0.1,
    useNativeDriver: false,
  }), [offset]);
  useLayoutEffect(() => {
    const carried = continuation.current;
    continuation.current = null;
    if (period.kind === 'month' && carried?.month === period.start) {
      offset.setValue(carried.offset);
      return;
    }
    offset.stopAnimation();
    offset.setValue(0);
    dragStart.current = 0;
    settling.current = false;
    pendingMonth.current = null;
    onSwipingChange(false);
  }, [period, offset, onSwipingChange]);
  useEffect(() => () => {
    offset.stopAnimation();
    onSwipingChange(false);
  }, [offset, onSwipingChange]);

  const latest = useRef({ period, canStepBack, canStepForward, width: pageWidth, stepMonth: feed.stepMonth });
  latest.current = { period, canStepBack, canStepForward, width: pageWidth, stepMonth: feed.stepMonth };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) =>
      latest.current.period.kind === 'month' && latest.current.width > 0 && Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => {
      const delta = pendingMonth.current;
      pendingMonth.current = null;
      chained.current = delta !== null;
      offset.stopAnimation((value) => {
        const { period, width, stepMonth } = latest.current;
        if (delta !== null && period.kind === 'month') {
          // Rebase around the incoming month without moving any visible letters.
          // The next gesture can now advance beyond it before the spring rests.
          const rebased = value + delta * width;
          dragStart.current = rebased;
          continuation.current = { month: addMonths(period.start, delta), offset: rebased };
          stepMonth(delta);
          tapSelect();
        } else dragStart.current = value;
      });
      settling.current = false;
      onSwipingChange(true);
    },
    onPanResponderMove: (_, g) => {
      const { canStepBack, canStepForward, width } = latest.current;
      const distance = dragStart.current + g.dx;
      const allowed = distance > 0 ? canStepBack : canStepForward;
      offset.setValue(allowed ? Math.max(-width, Math.min(width, distance)) : Math.sign(distance) * 12 * (1 - Math.exp(-Math.abs(distance) / 100)));
    },
    onPanResponderRelease: (_, g) => {
      const { canStepBack, canStepForward, width, stepMonth } = latest.current;
      const distance = dragStart.current + g.dx;
      const intent = chained.current ? g.dx : distance;
      const delta = intent > 0 ? -1 : 1;
      const allowed = delta === -1 ? canStepBack : canStepForward;
      const commit = allowed && (Math.abs(intent) > width * 0.3 || (Math.abs(g.dx) > 10 && Math.abs(g.vx) > 0.5 && g.dx * g.vx > 0));
      pendingMonth.current = commit ? delta : null;
      settling.current = true;
      const velocity = Math.abs(distance) >= width ? 0 : Math.max(-1200, Math.min(1200, g.vx * 1000));
      settle(commit ? -delta * width : 0, velocity).start(({ finished }) => {
        if (!finished) return;
        pendingMonth.current = null;
        if (commit) {
          tapSelect();
          stepMonth(delta);
        } else {
          settling.current = false;
          onSwipingChange(false);
        }
      });
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => {
      pendingMonth.current = null;
      settling.current = true;
      settle(0).start(({ finished }) => {
        if (!finished) return;
        settling.current = false;
        onSwipingChange(false);
      });
    },
  }), [offset, settle, onSwipingChange]);

  return (
    <View {...pan.panHandlers} style={period.kind === 'month' ? { overflow: swiping ? 'visible' : 'hidden' } : undefined}>
      <Pressable accessibilityRole="button"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessibilityLabel={`Showing ${periodLabel(period)}. Opens the period choices.`}
        accessibilityHint={period.kind === 'month' ? 'Swipe left or right to change month.' : undefined}
        onPress={() => { if (!settling.current) onPress(); }}
        style={({ pressed }) => [styles.period, period.kind !== 'month' && pressed && styles.stepPressed]}>
        <T weight="monoMedium" size={10.5} tracking={0.06} alpha={0.62}
          style={period.kind === 'month' && width > 0 ? { opacity: 0 } : undefined}>
          {periodLabel(period).toUpperCase()}
        </T>
        {period.kind === 'month' && width > 0 ? (
          <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', top: 0, bottom: 0, alignItems: 'center', left: -pageWidth - (pageWidth - width) / 2, width: pageWidth * 3, flexDirection: 'row', transform: [{ translateX: offset }] }}>
            {[-1, 0, 1].map((delta) => (
              <View key={delta} style={{ width: pageWidth, alignItems: 'center' }}>
                <T weight="monoMedium" size={10.5} tracking={0.06} alpha={0.62}>
                  {(delta === -1 && !canStepBack) || (delta === 1 && !canStepForward) ? '' : periodLabel({ kind: 'month', start: addMonths(period.start, delta) }).toUpperCase()}
                </T>
              </View>
            ))}
          </Animated.View>
        ) : null}
      </Pressable>
    </View>
  );
}

function Step({
  direction,
  enabled,
  hidden = false,
  onPress,
}: {
  direction: 'back' | 'forward';
  enabled: boolean;
  hidden?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction === 'back' ? 'Previous month' : 'Next month'}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled || hidden}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      onPress={() => {
        tapSelect();
        onPress();
      }}
      style={({ pressed }) => [styles.step, pressed && styles.stepPressed, hidden && { opacity: 0 }]}
    >
      {/* The app's one caret points down; turn it onto its side. */}
      <View style={{ transform: [{ rotate: direction === 'back' ? '90deg' : '-90deg' }] }}>
        <CaretIcon color={fg(enabled ? 0.55 : 0.18)} size={15} />
      </View>
    </Pressable>
  );
}

/** One of the choices the period pill opens onto. */
function Choice({
  label,
  on,
  alpha = 0.62,
  onPress,
}: {
  label: string;
  on?: boolean;
  alpha?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        tapSelect();
        onPress();
      }}
      style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && styles.stepPressed]}
    >
      <T
        weight="monoMedium"
        size={10.5}
        tracking={0.06}
        alpha={on ? undefined : alpha}
        style={on ? { color: color.ink } : undefined}
      >
        {label.toUpperCase()}
      </T>
    </Pressable>
  );
}

/** 02 — Spend: every transaction, and the ways to find one. */
export function SpendScreen({
  feed,
  categories,
  contentInset,
  onSave,
  onDelete,
}: {
  feed: TransactionFeed;
  /** Live categories, for the edit sheet's chips. */
  categories: { id: string; name: string }[];
  contentInset: { top: number; bottom: number };
  onSave: (input: SplitEdit) => void;
  onDelete: (target: SplitTarget) => void;
}) {
  /* Which row is being acted on: transient overlay state, so it stays local. */
  const [selected, setSelected] = useState<TransactionItem | null>(null);
  const open = useCallback((item: TransactionItem) => setSelected(item), []);
  /* The period pill has two shapes: the stepper, and the choices it opens onto. */
  const [expanded, setExpanded] = useState(false);
  const [swipingMonth, setSwipingMonth] = useState(false);
  const chevronTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSwipingChange = useCallback((active: boolean) => {
    if (chevronTimer.current) clearTimeout(chevronTimer.current);
    if (active) setSwipingMonth(true);
    else chevronTimer.current = setTimeout(() => setSwipingMonth(false), 220);
  }, []);
  useEffect(() => () => {
    if (chevronTimer.current) clearTimeout(chevronTimer.current);
  }, []);
  const [picking, setPicking] = useState(false);

  const collapse = () => {
    morph();
    setExpanded(false);
  };

  /* Landing halfway down a list you never scrolled is the one way a hand-off
     from Trends reads as broken, so an outside aim goes back to the top. */
  const listRef = useRef<SectionList<TransactionItem, { key: string; title: string }>>(null);
  useEffect(() => {
    if (!feed.focusToken) return;
    listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: false });
  }, [feed.focusToken]);

  const { filter, page, period, filtered } = feed;
  const sections = useMemo(
    () => page.groups.map((group) => ({ key: group.key, title: group.title, data: group.items })),
    [page.groups],
  );

  const heading = filtered
    ? 'Matching spend'
    : period.kind === 'all'
      ? 'Spent, all time'
      : period.kind === 'range'
        ? `Spent in the ${period.label.toLowerCase()}`
        : period.start === startOfMonth(Date.now())
          ? 'Spent so far'
          : `Spent in ${new Date(period.start).toLocaleString('en-US', { month: 'long' })}`;

  const header = (
    <View style={styles.head}>
      <View style={styles.header}>
        <View style={{ gap: 5, display: expanded ? 'none' : 'flex' }}>
          {/* The stepper alongside already names the period, so this counts
              the match instead — the one figure that moves as you filter. */}
          <Eyebrow size={10}>
            {page.matchCount === 1 ? '1 transaction' : `${page.matchCount} transactions`}
          </Eyebrow>
          <T size={19} lineHeight={21} tracking={-0.01}>
            Spend
          </T>
        </View>
        <View style={[styles.stepper, expanded && styles.stepperOpen]}>
          {expanded ? (
            <>
              <Choice label="Cancel" alpha={0.38} onPress={collapse} />
              <Choice
                label="Pick month"
                onPress={() => {
                  collapse();
                  setPicking(true);
                }}
              />
              <Choice
                label="All time"
                on={period.kind === 'all'}
                onPress={() => {
                  collapse();
                  feed.setAllTime();
                }}
              />
            </>
          ) : (
            <>
              <Step direction="back" hidden={swipingMonth} enabled={feed.canStepBack} onPress={() => feed.stepMonth(-1)} />
              <SwipePeriod feed={feed} swiping={swipingMonth} onSwipingChange={handleSwipingChange}
                onPress={() => {
                  tapSelect();
                  morph();
                  setExpanded(true);
                }}
              />
              <Step direction="forward" hidden={swipingMonth} enabled={feed.canStepForward} onPress={() => feed.stepMonth(1)} />
            </>
          )}
        </View>
      </View>

      <HeroCard style={styles.hero}>
        <View style={{ gap: 8 }}>
          <Eyebrow alpha={0.36}>{heading}</Eyebrow>
          <Amount value={figure(page.totalCents)} size={40} symbolSize={20} />
        </View>
        <View style={styles.heroMeta}>
          {page.transactionCount ? (
            <>
              <T size={11.5} alpha={0.4}>
                {page.transactionCount} transactions
              </T>
              <T size={11.5} alpha={0.4}>
                avg {figure(page.averageCents)} €
              </T>
            </>
          ) : (
            <T size={11.5} alpha={0.4}>
              {filtered ? 'No spending matches' : 'Nothing spent yet'}
            </T>
          )}
        </View>
      </HeroCard>

      <FieldSurface style={styles.search}>
        <SearchIcon color={fg(0.32)} size={15} />
        <TextField
          value={feed.searchText}
          onChangeText={feed.setSearch}
          placeholder="Search transactions"
          size={13}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          style={styles.searchInput}
        />
      </FieldSurface>

      {categoriesRow(feed)}
    </View>
  );

  return (
    <View style={styles.screen}>
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <Eyebrow alpha={0.3} style={styles.dayHead}>
            {section.title}
          </Eyebrow>
        )}
        renderItem={({ item, index, section }) => (
          <TransactionRow item={item} ruled={index < section.data.length - 1} onPress={open} />
        )}
        ListEmptyComponent={
          feed.loading ? null : (
            <Card quiet style={styles.empty}>
              <T size={13} alpha={0.6}>
                {filtered ? 'No transactions match' : 'No transactions in this period'}
              </T>
              {filtered ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    tapSelect();
                    feed.clearFilters();
                  }}
                >
                  <T size={12.5} style={{ color: color.accentBright }}>
                    Clear filters
                  </T>
                </Pressable>
              ) : null}
            </Card>
          )
        }
        ListFooterComponent={
          page.hasMore ? (
            <Eyebrow alpha={0.24} style={styles.footer}>
              Loading more
            </Eyebrow>
          ) : null
        }
        onEndReached={feed.loadMore}
        onEndReachedThreshold={0.4}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          paddingHorizontal: 4,
          paddingTop: contentInset.top,
          paddingBottom: contentInset.bottom,
        }}
      />

      {picking ? (
        <MonthPickerSheet
          monthStart={period.kind === 'month' ? period.start : null}
          monthsWithData={feed.monthsWithData}
          onPick={feed.pickMonth}
          onClose={() => setPicking(false)}
        />
      ) : null}

      <SpendItemSheet
        item={selected}
        categories={categories}
        onClose={() => setSelected(null)}
        onSave={onSave}
        onDelete={onDelete}
      />
    </View>
  );
}

/** Multi-select, which is exactly what `Chip` was split out of `CategoryChips` for. */
function categoriesRow(feed: TransactionFeed) {
  if (feed.categories.length < 2) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.chipRail}
      contentContainerStyle={styles.chips}
    >
      {feed.categories.map((cat) => (
        <Chip
          key={cat.id}
          label={cat.name}
          on={feed.filter.categoryIds.includes(cat.id)}
          onPress={() => feed.toggleCategory(cat.id)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  head: { gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 10,
  },
  stepperOpen: { flex: 1, paddingHorizontal: 6 },
  stepper: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 32,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: w(0.05),
    borderWidth: 1,
    borderColor: w(0.07),
  },
  step: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  stepPressed: { opacity: 0.6 },
  period: { paddingHorizontal: 6, height: 26, justifyContent: 'center' },
  choice: { paddingHorizontal: 12, height: 26, borderRadius: radius.pill, justifyContent: 'center' },
  choiceOn: { backgroundColor: color.textStrong },
  hero: {
    padding: 22,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  heroMeta: { gap: 6, alignItems: 'flex-end', paddingBottom: 4 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: w(0.04),
    borderWidth: 1,
    borderColor: w(0.06),
  },
  searchInput: { flex: 1, height: 38 },
  /* Bled out to the screen edges so the chips that don't fit peek in, rather
     than stopping flush at the gutter and reading as the whole set. */
  chipRail: { marginHorizontal: -(GUTTER + 4) },
  chips: { gap: 8, paddingHorizontal: GUTTER + 4, paddingVertical: 2 },
  dayHead: { paddingTop: 16, paddingBottom: 10 },
  empty: { padding: 22, gap: 10, marginTop: 18, alignItems: 'flex-start' },
  footer: { paddingTop: 18, textAlign: 'center' },
});
