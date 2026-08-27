import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Amount, Card, Divider, Eyebrow, HeroCard, T } from '../components/primitives';
import type { YouData } from '../queries/you';
import { amountLabel, figure } from '../format';
import { color, radius, w } from '../theme';

/** 05 — You: accounts and settings. */
export function YouScreen({ data, onReset }: { data: YouData; onReset: () => void }) {
  const rows = __DEV__
    ? [...data.settings, { name: 'Reset & reseed', value: 'DEV' }]
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
            <Eyebrow alpha={0.36}>Net worth</Eyebrow>
            <Amount value={figure(data.netWorthCents)} size={40} symbolSize={20} />
          </View>
          <T size={11.5} style={{ color: color.accentBright, paddingBottom: 5 }}>
            {amountLabel(data.monthDeltaCents, { signed: true })} this month
          </T>
        </View>
        <Divider />
        <View style={{ gap: 13 }}>
          {data.accounts.map((account) => (
            <View key={account.id} style={styles.accountRow}>
              <T size={13.5} alpha={0.86}>
                {account.name}
              </T>
              <T weight="mono" size={12.5} alpha={0.5}>
                {account.balanceCents < 0 ? '−' : ''}
                {figure(account.balanceCents)} €
              </T>
            </View>
          ))}
        </View>
      </HeroCard>

      <Card style={styles.settingsCard}>
        {rows.map((setting, i) => {
          const isReset = setting.value === 'DEV';
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
          return isReset ? (
            <Pressable key={setting.name} onPress={onReset} accessibilityRole="button">
              {row}
            </Pressable>
          ) : (
            <View key={setting.name}>{row}</View>
          );
        })}
      </Card>

      <Card quiet style={styles.signOut}>
        <T size={12.5} alpha={0.5}>
          Sign out
        </T>
      </Card>
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
  accountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  settingsCard: { paddingVertical: 6, paddingHorizontal: 20 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  settingBorder: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  signOut: {
    borderRadius: radius.tile,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
