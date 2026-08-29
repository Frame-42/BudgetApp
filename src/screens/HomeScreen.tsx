import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BudgetRing } from '../components/Charts';
import { Amount, Card, Divider, Eyebrow, HeroCard, StatusDot, T } from '../components/primitives';
import type { HomeData } from '../queries/home';
import { euroLabel, figure } from '../format';
import { color, radius, w } from '../theme';

/** 01 — Home: on track at a glance. */
export function HomeScreen({ data, name }: { data: HomeData; name: string }) {
  const firstName = name.split(' ')[0];
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const ahead = data.aheadOfPaceCents;

  /** Today is the filled bar; the rest of the week stays dimmer than the past. */
  const barColor = (day: HomeData['week'][number]) =>
    day.today ? color.mark : day.future ? w(0.08) : w(0.14);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ gap: 5 }}>
          <Eyebrow size={10}>{data.month}</Eyebrow>
          <T size={19} lineHeight={21} tracking={-0.01}>
            Good {partOfDay}, {firstName}
          </T>
        </View>
        <LinearGradient
          colors={[w(0.16), w(0.05)]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.avatar}
        >
          <T weight="medium" size={12} alpha={0.72}>
            {firstName.charAt(0)}
          </T>
        </LinearGradient>
      </View>

      <HeroCard style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={{ gap: 9 }}>
            <Eyebrow alpha={0.36}>Left to spend</Eyebrow>
            <Amount value={figure(data.leftToSpendCents)} />
            <T size={12.5} lineHeight={17.5} alpha={0.46}>
              of {figure(data.monthBudgetCents)} € · {data.daysRemaining} days remaining
            </T>
          </View>
          <BudgetRing percent={data.percentUsed} />
        </View>
        <Divider />
        <View style={styles.statusRow}>
          <StatusDot />
          <T size={13} lineHeight={17.5} alpha={0.78} style={{ flex: 1 }}>
            {data.monthBudgetCents === 0
              ? 'No budget for this month yet.'
              : ahead >= 0
                ? `On track — about ${euroLabel(ahead)} ahead of pace.`
                : `Over pace — about ${euroLabel(-ahead)} beyond the run rate.`}
          </T>
        </View>
      </HeroCard>

      <View style={styles.statRow}>
        <Card style={styles.statTile}>
          <Eyebrow tracking={0.14}>Daily pace</Eyebrow>
          <View style={{ gap: 5 }}>
            <T weight="light" size={27} lineHeight={27} tracking={-0.03}>
              {figure(data.dailyPaceCents)} €
            </T>
            <T size={11.5} alpha={0.4}>
              {figure(data.dailyAvailableCents)} € available
            </T>
          </View>
        </Card>

        <Card style={styles.statTile}>
          <Eyebrow tracking={0.14}>This week</Eyebrow>
          <View style={styles.weekRow}>
            {data.week.map((day, i) => (
              <View
                key={i}
                style={[
                  styles.weekBar,
                  // A day with nothing spent still needs to read as a bar.
                  { height: `${Math.max(4, day.fraction * 100)}%`, backgroundColor: barColor(day) },
                ]}
              />
            ))}
          </View>
        </Card>
      </View>

      <Card style={styles.categoryCard}>
        <View style={styles.rowBetween}>
          <Eyebrow tracking={0.14}>Categories</Eyebrow>
          <T size={11.5} alpha={0.38}>
            {data.categories.length} of {data.categoryCount}
          </T>
        </View>
        <View style={{ gap: 15 }}>
          {data.categories.map((cat) => (
            <View key={cat.id} style={{ gap: 8 }}>
              <View style={styles.rowBaseline}>
                <T size={13.5} alpha={0.86}>
                  {cat.name}
                </T>
                <T weight="mono" size={12} alpha={0.44}>
                  {cat.limitCents > 0
                    ? `${figure(cat.spentCents)} / ${figure(cat.limitCents)}`
                    : `${figure(cat.spentCents)} €`}
                </T>
              </View>
              {/* With no limit set there is nothing to fill against, and an empty
                  track reads as a limit of zero rather than as no limit at all. */}
              {cat.limitCents > 0 ? (
                <View style={styles.track}>
                  <View
                    style={[
                      styles.trackFill,
                      {
                        width: `${cat.fill * 100}%`,
                        backgroundColor: `rgba(233,235,242,${cat.alpha})`,
                      },
                    ]}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </Card>

      {data.nextOut ? (
        <Card quiet style={styles.nextOut}>
          <View style={{ gap: 4 }}>
            <Eyebrow alpha={0.32} tracking={0.14}>
              Next out
            </Eyebrow>
            <T size={13} alpha={0.8}>
              {data.nextOut.label}
            </T>
          </View>
          <T size={15} alpha={0.6} tracking={-0.02}>
            {euroLabel(Math.abs(data.nextOut.amountCents))}
          </T>
        </Card>
      ) : null}
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
    paddingBottom: 14,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: w(0.09),
  },
  hero: { padding: 24, paddingBottom: 22, gap: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  statRow: { flexDirection: 'row', gap: 12 },
  statTile: { flex: 1, borderRadius: radius.tile, padding: 18, gap: 12, minHeight: 104 },
  weekRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 44 },
  weekBar: { flex: 1, borderRadius: 3 },
  categoryCard: { padding: 20, gap: 16 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowBaseline: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  track: { height: 3, borderRadius: 2, backgroundColor: color.track, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 2 },
  nextOut: {
    borderRadius: radius.tile,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
