import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutAnimation, Pressable, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { Amount, Card, Eyebrow, FieldSurface, HeroCard, T, TextField } from '../components/primitives';
import { Chip } from '../components/CategoryChips';
import { CaretIcon, SearchIcon } from '../components/Icons';
import { TransactionRow } from '../components/TransactionRow';
import { SpendItemSheet } from '../components/SpendItemSheet';
import { MonthPickerSheet } from '../components/MonthPickerSheet';
import { tapSelect } from '../haptics';
import type { TransactionItem } from '../queries/transactions';
import type { Period, TransactionFeed } from '../state/useTransactionFeed';
import { figure } from '../format';
import { MONTH_ABBR, startOfMonth } from '../time';
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

function Step({
  direction,
  enabled,
  onPress,
}: {
  direction: 'back' | 'forward';
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction === 'back' ? 'Previous month' : 'Next month'}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={() => {
        tapSelect();
        onPress();
      }}
      style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
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
  onSave: (input: {
    id: string;
    amountCents: number;
    categoryId: string | null;
    income: boolean;
    merchant: string;
  }) => void;
  onDelete: (id: string) => void;
}) {
  /* Which row is being acted on: transient overlay state, so it stays local. */
  const [selected, setSelected] = useState<TransactionItem | null>(null);
  const open = useCallback((item: TransactionItem) => setSelected(item), []);
  /* The period pill has two shapes: the stepper, and the choices it opens onto. */
  const [expanded, setExpanded] = useState(false);
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
              <Step direction="back" enabled={feed.canStepBack} onPress={() => feed.stepMonth(-1)} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Showing ${periodLabel(period)}. Opens the period choices.`}
                onPress={() => {
                  tapSelect();
                  morph();
                  setExpanded(true);
                }}
                style={({ pressed }) => [styles.period, pressed && styles.stepPressed]}
              >
                <T weight="monoMedium" size={10.5} tracking={0.06} alpha={0.62}>
                  {periodLabel(period).toUpperCase()}
                </T>
              </Pressable>
              <Step direction="forward" enabled={feed.canStepForward} onPress={() => feed.stepMonth(1)} />
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
