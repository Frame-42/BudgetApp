import React, { useState } from 'react';
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

import { TabBar } from './src/components/TabBar';
import { HomeScreen } from './src/screens/HomeScreen';
import { SpendScreen } from './src/screens/SpendScreen';
import { AddScreen } from './src/screens/AddScreen';
import { TrendsScreen } from './src/screens/TrendsScreen';
import { YouScreen } from './src/screens/YouScreen';
import { addCategories } from './src/data';
import { GUTTER, color } from './src/theme';

function Phone() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState(0);

  /* Entry state lives above the screens so it survives a trip to another tab. */
  const [amount, setAmount] = useState('44');
  const [category, setCategory] = useState(addCategories[0]);

  const screens = [
    <HomeScreen key="home" />,
    <SpendScreen key="spend" />,
    <AddScreen
      key="add"
      amount={amount}
      onAmountChange={setAmount}
      category={category}
      onCategoryChange={setCategory}
      onCancel={() => {
        setAmount('');
        setTab(0);
      }}
      onSubmit={() => {
        setAmount('');
        setCategory(addCategories[0]);
        setTab(1);
      }}
    />,
    <TrendsScreen key="trends" />,
    <YouScreen key="you" />,
  ];

  return (
    <LinearGradient
      colors={color.bg as unknown as [string, string, string]}
      locations={color.bgStops as unknown as [number, number, number]}
      /* CSS 178deg: essentially top-to-bottom with a hair of tilt. */
      start={{ x: 0.48, y: 0 }}
      end={{ x: 0.52, y: 1 }}
      style={styles.fill}
    >
      <StatusBar style="light" />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 24) + 6 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {screens[tab]}
      </ScrollView>
      <TabBar active={tab} onChange={setTab} bottomInset={insets.bottom} />
    </LinearGradient>
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
      <Phone />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingBottom: 16 },
});
