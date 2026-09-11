import React, { useEffect, useRef, useState } from 'react';
import { Appearance, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useFonts,
  Geist_300Light,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
} from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';

import { Background } from './src/components/primitives';
import { TabBar, TAB_BAR_HEIGHT } from './src/components/TabBar';
import { HomeScreen } from './src/screens/HomeScreen';
import { SpendScreen } from './src/screens/SpendScreen';
import { AddScreen } from './src/screens/AddScreen';
import { TrendsScreen } from './src/screens/TrendsScreen';
import { YouScreen } from './src/screens/YouScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { BudgetProvider, useBudget } from './src/state/BudgetProvider';
import { DevToolsProvider } from './src/devtools/DevToolsContext';
import { useTransactionFeed } from './src/state/useTransactionFeed';
import { useTrendsView } from './src/state/useTrendsView';
import { centsToAmountInput, parseAmountToCents } from './src/format';
import { partInMonth } from './src/db/split';
import type { Cadence } from './src/db/types';
import type { TransactionItem } from './src/queries/transactions';
import { onDay, startOfDay } from './src/time';
import {
  DEFAULT_APPEARANCE,
  GUTTER,
  ThemeContext,
  palettes,
  resolveScheme,
  type Scheme,
} from './src/theme';

/** Everything the Add screen's form holds. */
type Entry = {
  amount: string;
  categoryId: string | null;
  merchant: string;
  /** The start of the day it happened; null for today. */
  day: number | null;
  months: number;
  cadence: Cadence | null;
};

const BLANK: Entry = { amount: '', categoryId: null, merchant: '', day: null, months: 1, cadence: null };

/** A transaction as the form shows it. The date is where the spread starts. */
function entryFor(item: TransactionItem): Entry {
  const startAt = item.split?.startAt ?? item.occurredAt;
  const day = startOfDay(startAt);
  return {
    amount: centsToAmountInput(item.split?.totalCents ?? item.amountCents),
    categoryId: item.categoryId,
    merchant: item.merchant,
    day: day === startOfDay(Date.now()) ? null : day,
    months: item.split?.count ?? 1,
    cadence: null,
  };
}

/* Spend virtualizes its own list, which cannot nest in the shared ScrollView;
   it takes the insets as props and scrolls itself. */
const SCROLLS = [true, false, true, true, true];

function Phone() {
  const insets = useSafeAreaInsets();
  const {
    data,
    addExpense,
    updateExpense,
    removeExpense,
    stopRecurring,
    completeOnboarding,
    notePickedMonth,
    reset,
    saveBudget,
    planImport,
    runImport,
    exportCsv,
    loadSampleData,
    setAppearance,
  } = useBudget();
  const [tab, setTab] = useState(0);
  /* Spend's list is filtered and paged, so it keeps its own state and its own
     database subscription rather than riding the provider's snapshot. */
  const feed = useTransactionFeed();
  /* Trends narrows by category, which is a query argument, so it owns its state too. */
  const trends = useTrendsView();

  /* Entry state lives above the screens so it survives a trip to another tab. */
  const [entry, setEntry] = useState<Entry>(BLANK);
  const set =
    <K extends keyof Entry>(key: K) =>
    (value: Entry[K]) =>
      setEntry((current) => ({ ...current, [key]: value }));
  /* The transaction Spend's Edit handed over, while the Add screen is editing it. */
  const [editing, setEditing] = useState<TransactionItem | null>(null);
  /* The new expense that was half-typed when an edit began. It comes back when
     the edit ends, so editing something never costs the draft. */
  const draft = useRef<Entry | null>(null);

  useEffect(() => {
    // Not while editing: an uncategorised row or an income has no category on
    // purpose, and filling one in would file it somewhere on save.
    if (!editing && !entry.categoryId && data) set('categoryId')(data.add.categories[0]?.id ?? null);
  }, [data, entry.categoryId, editing]);

  if (!data) {
    return (
      <Background />
    );
  }

  /* Rendered outside the tabbed ScrollView below: onboarding owns its own
     scroll container and insets, and there is no tab bar to clear. */
  if (!data.onboarded) {
    return (
      <Background>
        <OnboardingScreen categories={data.add.categories} onComplete={completeOnboarding} />
      </Background>
    );
  }

  const startEdit = (item: TransactionItem) => {
    if (!editing) draft.current = entry;
    setEntry(entryFor(item));
    setEditing(item);
    setTab(2);
  };

  const endEdit = () => {
    setEntry(draft.current ?? BLANK);
    draft.current = null;
    setEditing(null);
  };

  /* An edit belongs to the trip from Spend: leaving the Add tab abandons it,
     rather than leaving a half-finished edit waiting behind the + button. */
  const changeTab = (next: number) => {
    if (editing && next !== 2) endEdit();
    setTab(next);
  };

  const submit = async () => {
    const amountCents = parseAmountToCents(entry.amount);
    if (editing) {
      if (amountCents <= 0) return;
      const startAt = editing.split?.startAt ?? editing.occurredAt;
      await updateExpense({
        id: editing.id,
        splitId: editing.split?.id ?? null,
        amountCents,
        income: editing.income,
        months: entry.months,
        categoryId: editing.income ? editing.categoryId : entry.categoryId,
        merchant: entry.merchant,
        // Keeps the time of day it was entered at, whichever day it lands on.
        occurredAt: onDay(entry.day ?? startOfDay(Date.now()), startAt),
      });
      endEdit();
      setTab(1);
      return;
    }
    await addExpense({ ...entry, amountCents });
    setEntry({ ...BLANK, categoryId: entry.categoryId });
    setTab(1);
  };

  /* The whole hand-off: Trends' scope becomes the list's filter, and the tab
     bar's second entry is where that list lives. */
  const seeTransactions = (scope: Parameters<typeof feed.focus>[0]) => {
    feed.focus(scope);
    setTab(1);
  };

  const contentInset = {
    top: Math.max(insets.top, 24) + 6,
    bottom: Math.max(insets.bottom, 12) + TAB_BAR_HEIGHT + 28,
  };

  const screens = [
    <HomeScreen key="home" data={data.home} name={data.you.name} />,
    <SpendScreen
      key="spend"
      feed={feed}
      contentInset={contentInset}
      onEdit={startEdit}
      onDelete={removeExpense}
      onStopRecurring={stopRecurring}
    />,
    <AddScreen
      /* A new key per mode, so moving between adding and editing starts a fresh form. */
      key={editing ? `edit-${editing.id}` : 'add'}
      amount={entry.amount}
      onAmountChange={set('amount')}
      merchant={entry.merchant}
      onMerchantChange={set('merchant')}
      categories={data.add.categories}
      categoryId={entry.categoryId}
      onCategoryChange={set('categoryId')}
      day={entry.day}
      onDayChange={set('day')}
      months={entry.months}
      onMonthsChange={set('months')}
      cadence={entry.cadence}
      onCadenceChange={set('cadence')}
      defaults={editing ? entryFor(editing) : BLANK}
      editing={
        editing
          ? {
              income: editing.income,
              replacesCents: editing.income
                ? 0
                : Math.abs(
                    partInMonth(
                      editing.split?.totalCents ?? editing.amountCents,
                      editing.split?.count ?? 1,
                      editing.split?.startAt ?? editing.occurredAt,
                      Date.now(),
                    ),
                  ),
            }
          : null
      }
      leftToSpendCents={data.home.leftToSpendCents}
      daysRemaining={data.home.daysRemaining}
      onSubmit={submit}
      onCancel={() => {
        endEdit();
        setTab(1);
      }}
    />,
    trends.data ? (
      <TrendsScreen
        key="trends"
        data={trends.data}
        onChangePeriod={trends.setEndOffset}
        showHint={!data.monthPicked}
        categoryIds={trends.categoryIds}
        onToggleCategories={trends.toggleCategories}
        onClearCategories={trends.clearCategories}
        onPickMonth={notePickedMonth}
        onSeeTransactions={seeTransactions}
      />
    ) : (
      <View key="trends" />
    ),
    <YouScreen
      key="you"
      data={data.you}
      categories={data.add.categories}
      onPlanImport={planImport}
      onRunImport={runImport}
      onExport={exportCsv}
      onSaveBudget={saveBudget}
      onAppearanceChange={setAppearance}
      onReset={reset}
      onLoadSample={loadSampleData}
    />,
  ];

  return (
    <Background>
      {SCROLLS[tab] ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[
            styles.content,
            { paddingTop: contentInset.top, paddingBottom: contentInset.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {screens[tab]}
        </ScrollView>
      ) : (
        <View style={[styles.fill, styles.content]}>{screens[tab]}</View>
      )}
      <TabBar active={tab} onChange={changeTab} bottomInset={insets.bottom} />
    </Background>
  );
}

/** The phone's scheme, with anything it can't name read as the app's original dark. */
function useSystemScheme(): Scheme {
  return useColorScheme() === 'light' ? 'light' : 'dark';
}

/**
 * Resolves the stored appearance to a palette for everything below. Until the
 * database has answered it uses the default, which is what a first run gets.
 *
 * The choice is pushed to the OS as well, so what the app does not draw itself —
 * the keyboard, alerts, the share sheet — lands in the same scheme. That override
 * is also what `useColorScheme` then reports, so "system" has to clear it before
 * the phone's own answer comes back.
 */
function Themed({ children }: { children: React.ReactNode }) {
  const appearance = useBudget().data?.you.appearance ?? DEFAULT_APPEARANCE;
  const system = useSystemScheme();

  useEffect(() => {
    Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance);
  }, [appearance]);

  const theme = palettes[resolveScheme(appearance, system)];

  /* The native root view shows through wherever the page doesn't cover — behind
     the keyboard as it slides, around a modal as it presents. */
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.color.bg[2]).catch(() => {});
  }, [theme]);
  return (
    <ThemeContext.Provider value={theme}>
      <StatusBar style={theme.statusBar} />
      {children}
    </ThemeContext.Provider>
  );
}

export default function App() {
  const [loaded] = useFonts({
    Geist_300Light,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_500Medium,
  });

  const system = useSystemScheme();

  if (!loaded) {
    const ground = palettes[resolveScheme(DEFAULT_APPEARANCE, system)].color.bg[1];
    return <View style={[styles.fill, { backgroundColor: ground }]} />;
  }

  return (
    <SafeAreaProvider>
      <DevToolsProvider>
        <BudgetProvider>
          <Themed>
            <Phone />
          </Themed>
        </BudgetProvider>
      </DevToolsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: GUTTER },
});
