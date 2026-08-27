import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Amount, Eyebrow, HeroCard, T } from '../components/primitives';
import { spend } from '../data';
import { color, radius, w } from '../theme';

/** 02 — Spend: where it went. */
export function SpendScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ gap: 5 }}>
          <Eyebrow size={10}>August</Eyebrow>
          <T size={19} lineHeight={21} tracking={-0.01}>
            Spend
          </T>
        </View>
        <View style={styles.chip}>
          <T size={11.5} alpha={0.55}>
            All accounts
          </T>
        </View>
      </View>

      <HeroCard style={styles.hero}>
        <View style={{ gap: 8 }}>
          <Eyebrow alpha={0.36}>Spent so far</Eyebrow>
          <Amount value={spend.total} size={40} symbolSize={20} />
        </View>
        <View style={styles.heroMeta}>
          <T size={11.5} alpha={0.4}>
            {spend.transactionCount} transactions
          </T>
          <T size={11.5} alpha={0.4}>
            avg {spend.average} €
          </T>
        </View>
      </HeroCard>

      {spend.groups.map((group, gi) => (
        <View key={group.title} style={styles.group}>
          <Eyebrow alpha={0.3}>{group.title}</Eyebrow>
          <View>
            {group.items.map((item, i) => {
              /* Every row is ruled off except the very last one on the screen. */
              const last = gi === spend.groups.length - 1 && i === group.items.length - 1;
              return (
              <View key={item.name} style={[styles.row, !last && styles.rowBorder]}>
                <View style={{ gap: 4 }}>
                  <T size={14} style={{ color: color.textStrong }}>
                    {item.name}
                  </T>
                  <T weight="mono" size={11} alpha={0.34}>
                    {item.category}
                  </T>
                </View>
                <T
                  size={14}
                  tracking={-0.02}
                  alpha={0.72}
                  style={'income' in item && item.income ? { color: color.accentBright } : undefined}
                >
                  {item.amount}
                </T>
              </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
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
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: w(0.05),
    borderWidth: 1,
    borderColor: w(0.07),
  },
  hero: {
    padding: 22,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  heroMeta: { gap: 6, alignItems: 'flex-end', paddingBottom: 4 },
  group: { gap: 10, paddingHorizontal: 4, paddingTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: color.hairline },
});
