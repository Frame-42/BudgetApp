import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useFonts,
  Geist_300Light,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
} from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';

import { TabBar, TAB_BAR_HEIGHT } from './src/components/TabBar';
import { HomeScreen } from './src/screens/HomeScreen';
import { SpendScreen } from './src/screens/SpendScreen';
import { AddScreen } from './src/screens/AddScreen';
import { TrendsScreen } from './src/screens/TrendsScreen';
import { YouScreen } from './src/screens/YouScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { BudgetProvider, useBudget } from './src/state/BudgetProvider';
import { parseAmountToCents } from './src/format';
import { GUTTER, color } from './src/theme';

function Background({ children }: { children: React.ReactNode }) {
  return (
    <LinearGradient
      colors={color.bg as unknown as [string, string, string]}
      locations={color.bgStops as unknown as [number, number, number]}
      /* CSS 178deg: essentially top-to-bottom with a hair of tilt. */
      start={{ x: 0.48, y: 0 }}
      end={{ x: 0.52, y: 1 }}
      style={styles.fill}
    >
      {children}
    </LinearGradient>
  );
}

function Phone() {
  const insets = useSafeAreaInsets();
  const { data, addExpense, updateExpense, removeExpense, completeOnboarding, reset, loadSampleData } =
    useBudget();
  const [tab, setTab] = useState(0);

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

  const screens = [
    <HomeScreen key="home" data={data.home} name={data.you.name} />,
    <SpendScreen
      key="spend"
      data={data.spend}
      month={data.home.month}
      categories={data.add.categories}
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
    <TrendsScreen key="trends" data={data.trends} />,
    <YouScreen key="you" data={data.you} onReset={reset} onLoadSample={loadSampleData} />,
  ];

  return (
    <Background>
      <StatusBar style="light" />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 24) + 6,
            paddingBottom: Math.max(insets.bottom, 12) + TAB_BAR_HEIGHT + 28,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {screens[tab]}
      </ScrollView>
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
      <BudgetProvider>
        <Phone />
      </BudgetProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: GUTTER },
});
