import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Amount, Card, Divider, Eyebrow, HeroCard, T } from '../components/primitives';
import { ImportSheet } from '../components/ImportSheet';
import type { ImportPlan } from '../import/plan';
import { ImportIcon } from '../components/Icons';
import { tapSelect } from '../haptics';
import type { YouData } from '../queries/you';
import { figure } from '../format';
import { color, fg, radius, w } from '../theme';
import { useDevTools } from '../devtools/DevToolsContext';
import { DevToolsPanel } from '../devtools/DevToolsPanel';

/** A settings row; `onPress` is what makes it tappable. */
type Row = { name: string; value: string; onPress?: () => void };

/** 05 — You: accounts and settings. */
export function YouScreen({
  data,
  categories,
  onPlanImport,
  onRunImport,
  onReset,
  onLoadSample,
}: {
  data: YouData;
  categories: { id: string; name: string }[];
  onPlanImport: (text: string) => Promise<ImportPlan>;
  onRunImport: (plan: ImportPlan) => Promise<number>;
  onReset: () => void;
  onLoadSample: () => void;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const { enabled: devToolsEnabled, setEnabled: setDevToolsEnabled } = useDevTools();

  /* The toggle itself only exists in a __DEV__ build — same guarantee a real
     production bundle already had, just explicit now instead of implicit. */
  const rows: Row[] = __DEV__
    ? [
        ...data.settings,
        {
          name: 'Developer mode',
          value: devToolsEnabled ? 'ON' : 'OFF',
          onPress: () => setDevToolsEnabled(!devToolsEnabled),
        },
      ]
    : data.settings;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <LinearGradient
          colors={[w(0.18), w(0.05)]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.avatar}
        >
          <T size={20} lineHeight={24} alpha={0.8}>
            {data.name.charAt(0)}
          </T>
        </LinearGradient>
        <View style={{ gap: 5 }}>
          <T size={19} lineHeight={21} tracking={-0.01}>
            {data.name}
          </T>
          <T weight="mono" size={11.5} alpha={0.34}>
            {data.memberSince}
          </T>
        </View>
      </View>

      <HeroCard style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={{ gap: 8 }}>
            <Eyebrow alpha={0.36}>Money tracked</Eyebrow>
            <Amount value={figure(data.trackedCents)} size={40} symbolSize={20} />
          </View>
          {/* Plain rather than accented: colour is reserved for status, and a
              count of rows is not one. */}
          <T weight="mono" size={11.5} alpha={0.38} style={{ paddingBottom: 5 }}>
            {data.trackedCount} {data.trackedCount === 1 ? 'entry' : 'entries'}
          </T>
        </View>
        {data.topCategories.length > 0 ? (
          <>
            <Divider />
            <View style={{ gap: 13 }}>
              {data.topCategories.map((category) => (
                <View key={category.id} style={styles.heroRow}>
                  <T size={13.5} alpha={0.86}>
                    {category.name}
                  </T>
                  <T weight="mono" size={12.5} alpha={0.5}>
                    {figure(category.spentCents)} €
                  </T>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </HeroCard>

      <Card style={styles.settingsCard}>
        {rows.map((setting, i) => {
          const row = (
            <View
              style={[styles.settingRow, i < rows.length - 1 && styles.settingBorder]}
            >
              <T size={13.5} alpha={0.86}>
                {setting.name}
              </T>
              <T weight="mono" size={12.5} alpha={0.4}>
                {setting.value}
              </T>
            </View>
          );
          return setting.onPress ? (
            <Pressable key={setting.name} onPress={setting.onPress} accessibilityRole="button">
              {row}
            </Pressable>
          ) : (
            <View key={setting.name}>{row}</View>
          );
        })}
      </Card>

      {__DEV__ && devToolsEnabled ? (
        <DevToolsPanel onReset={onReset} onLoadSample={onLoadSample} />
      ) : null}

      {/* An action, not a setting — so a tile of its own rather than a fifth
          row in the card above, where the right-hand slot means "current value". */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Import transactions"
        accessibilityHint="Opens the transaction import"
        onPress={() => {
          tapSelect();
          setImportOpen(true);
        }}
        style={({ pressed }) => [styles.importTile, pressed && styles.importTilePressed]}
      >
        <ImportIcon color={fg(0.55)} size={18} />
        <View style={{ gap: 5 }}>
          <T size={13.5} alpha={0.86}>
            Import transactions
          </T>
          <Eyebrow alpha={0.3}>CSV or bank export</Eyebrow>
        </View>
      </Pressable>

      <Card quiet style={styles.signOut}>
        <T size={12.5} alpha={0.5}>
          Sign out
        </T>
      </Card>

      <ImportSheet
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        categories={categories}
        onPlan={onPlanImport}
        onRun={onRunImport}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 18,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: w(0.09),
  },
  hero: { padding: 22, gap: 18 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  settingsCard: { paddingVertical: 6, paddingHorizontal: 20 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  settingBorder: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  importTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radius.tile,
    backgroundColor: color.tile,
    borderWidth: 1,
    borderColor: color.tileBorder,
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  importTilePressed: { backgroundColor: w(0.085) },
  signOut: {
    borderRadius: radius.tile,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
