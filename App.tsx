import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
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
import { parseAmountToCents } from './src/format';
import { GUTTER, color } from './src/theme';

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
    completeOnboarding,
    notePickedMonth,
    reset,
    saveBudget,
    planImport,
    runImport,
    exportCsv,
    loadSampleData,
  } = useBudget();
  const [tab, setTab] = useState(0);
  /* Spend's list is filtered and paged, so it keeps its own state and its own
     database subscription rather than riding the provider's snapshot. */
  const feed = useTransactionFeed();
  /* Trends narrows by category, which is a query argument, so it owns its state too. */
  const trends = useTrendsView();

  /* Entry state lives above the screens so it survives a trip to another tab. */
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState('');

  useEffect(() => {
    if (!categoryId && data) setCategoryId(data.add.categories[0]?.id ?? null);
  }, [data, categoryId]);

  if (!data) {
    return (
      <Background>
        <StatusBar style="light" />
      </Background>
    );
  }

  /* Rendered outside the tabbed ScrollView below: onboarding owns its own
     scroll container and insets, and there is no tab bar to clear. */
  if (!data.onboarded) {
    return (
      <Background>
        <StatusBar style="light" />
        <OnboardingScreen categories={data.add.categories} onComplete={completeOnboarding} />
      </Background>
    );
  }

  const submit = async () => {
    await addExpense({ amountCents: parseAmountToCents(amount), categoryId, merchant });
    setAmount('');
    setMerchant('');
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
      categories={data.add.categories}
      contentInset={contentInset}
      onSave={updateExpense}
      onDelete={removeExpense}
    />,
    <AddScreen
      key="add"
      amount={amount}
      onAmountChange={setAmount}
      merchant={merchant}
      onMerchantChange={setMerchant}
      categories={data.add.categories}
      categoryId={categoryId}
      onCategoryChange={setCategoryId}
      leftToSpendCents={data.home.leftToSpendCents}
      daysRemaining={data.home.daysRemaining}
      onSubmit={submit}
    />,
    trends.data ? (
      <TrendsScreen
        key="trends"
        data={trends.data}
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
      onReset={reset}
      onLoadSample={loadSampleData}
    />,
  ];

  return (
    <Background>
      <StatusBar style="light" />
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
      <TabBar active={tab} onChange={setTab} bottomInset={insets.bottom} />
    </Background>
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

  if (!loaded) return <View style={[styles.fill, { backgroundColor: color.bg[1] }]} />;

  return (
    <SafeAreaProvider>
      <DevToolsProvider>
        <BudgetProvider>
          <Phone />
        </BudgetProvider>
      </DevToolsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: GUTTER },
});
