import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LegendRule, PaceChart, SplitDonut } from '../components/Charts';
import { Amount, Card, Divider, Eyebrow, HeroCard, StatusDot, T } from '../components/primitives';
import { trends } from '../data';
import { color, radius, w } from '../theme';

/** 04 — Trends: the six-month shape. */
export function TrendsScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ gap: 5 }}>
          <Eyebrow size={10}>Last 6 months</Eyebrow>
          <T size={19} lineHeight={21} tracking={-0.01}>
            Trends
          </T>
        </View>
        <View style={styles.chip}>
          <T size={11.5} alpha={0.55}>
            Monthly
          </T>
        </View>
      </View>

      <HeroCard style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={{ gap: 8 }}>
            <Eyebrow alpha={0.36}>Monthly average</Eyebrow>
            <Amount value={trends.monthlyAverage} size={40} symbolSize={20} />
          </View>
          <T size={11.5} style={{ color: color.accentBright, paddingBottom: 5 }}>
            {trends.delta}
          </T>
        </View>
        <View style={styles.monthRow}>
          {trends.months.map((m) => (
            <View key={m.label} style={styles.monthCol}>
              <View
                style={[
                  styles.monthBar,
                  { height: m.height, backgroundColor: m.active ? color.mark : w(0.12) },
                ]}
              />
              <T weight="mono" size={10} alpha={m.active ? 0.62 : 0.3}>
                {m.label}
              </T>
            </View>
          ))}
        </View>
      </HeroCard>

      <Card style={styles.paceCard}>
        <View style={styles.paceHeader}>
          <Eyebrow tracking={0.14}>Pace vs last month</Eyebrow>
          <View style={{ gap: 6, alignItems: 'flex-end' }}>
            <View style={styles.legendRow}>
              <LegendRule />
              <T size={10.5} alpha={0.72}>
                August
              </T>
            </View>
            <View style={styles.legendRow}>
              <LegendRule dashed />
              <T size={10.5} alpha={0.42}>
                July
              </T>
            </View>
          </View>
        </View>
        <PaceChart />
        <Divider />
        <T size={12.5} lineHeight={17.5} alpha={0.7}>
          {trends.paceNote}
        </T>
      </Card>

      <Card style={styles.splitCard}>
        <Eyebrow tracking={0.14}>Where it goes</Eyebrow>
        <View style={styles.splitRow}>
          <SplitDonut segments={trends.split}>
            <T weight="light" size={19} lineHeight={19} tracking={-0.03}>
              ${trends.monthlyAverage}
            </T>
            <Eyebrow size={8.5} alpha={0.32} tracking={0.12}>
              avg / mo
            </Eyebrow>
          </SplitDonut>
          <View style={styles.legend}>
            {trends.split.map((s) => (
              <View key={s.name} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: `rgba(233,235,242,${s.alpha})` }]} />
                <T size={12.5} alpha={0.82} style={{ flex: 1 }}>
                  {s.name}
                </T>
                <T weight="mono" size={11} alpha={0.42}>
                  {s.percent}
                </T>
              </View>
            ))}
          </View>
        </View>
      </Card>

      <Card quiet style={styles.insight}>
        <StatusDot />
        <T size={12.5} lineHeight={17.5} alpha={0.72} style={{ flex: 1 }}>
          {trends.insight}
        </T>
      </Card>
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
  hero: { padding: 22, gap: 22 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  monthRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, height: 96 },
  monthCol: { flex: 1, alignItems: 'center', gap: 9 },
  monthBar: { width: '100%', borderRadius: 5 },
  paceCard: { padding: 20, gap: 18 },
  paceHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  splitCard: { padding: 20, gap: 18 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  legend: { flex: 1, gap: 11 },
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
