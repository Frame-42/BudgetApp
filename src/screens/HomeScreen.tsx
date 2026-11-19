import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CommitmentBar } from '../components/Charts';
import { Amount, Card, Divider, Eyebrow, HeroCard, StatusDot, T } from '../components/primitives';
import type { HomeData } from '../queries/home';
import { amountLabel, euroLabel, figure } from '../format';
import { shortDate } from '../time';
import { makeStyles, radius, useTheme } from '../theme';

/** How many planned items the card names before it counts the rest. */
const COMING_UP_ROWS = 4;

/** 01 — Home: on track at a glance. */
export function HomeScreen({ data, name }: { data: HomeData; name: string }) {
  const styles = useStyles();
  const { color, w, mark } = useTheme();
  const firstName = name.split(' ')[0];
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const ahead = data.aheadOfPaceCents;
  const over = data.freeCents < 0;
  const forecast = data.forecast;

  /* The forecast speaks first once there is history to read; before that, the
     straight-line pace is the only honest thing to say. */
  const status =
    data.monthBudgetCents === 0
      ? 'No budget for this month yet.'
      : forecast
        ? forecast.vsBudgetCents >= 0
          ? `Likely to finish near ${euroLabel(forecast.landingCents)} — ${euroLabel(forecast.vsBudgetCents)} under budget.`
          : `Likely to finish near ${euroLabel(forecast.landingCents)} — ${euroLabel(-forecast.vsBudgetCents)} over budget.`
        : ahead >= 0
          ? `On track — about ${euroLabel(ahead)} ahead of pace.`
          : `Over pace — about ${euroLabel(-ahead)} beyond the run rate.`;

  const shown = data.comingUp.slice(0, COMING_UP_ROWS);
  const more = data.comingUp.length - shown.length;
  const next = data.nextMonth;

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
        <View style={{ gap: 9 }}>
          <Eyebrow alpha={0.36}>{over ? 'Over budget by' : 'Left to spend'}</Eyebrow>
          <Amount value={figure(data.freeCents)} />
          <T size={12.5} lineHeight={17.5} alpha={0.46}>
            of {figure(data.monthBudgetCents)} € · {data.daysRemaining} days remaining
          </T>
        </View>
        <View style={{ gap: 12 }}>
          <CommitmentBar
            spentCents={data.spentCents}
            plannedCents={data.plannedCents}
            budgetCents={data.monthBudgetCents}
          />
          <View style={styles.legend}>
            {[
              { label: 'Spent', cents: data.spentCents, swatch: color.mark },
              { label: 'Planned', cents: data.plannedCents, swatch: mark(0.34) },
              { label: 'Free', cents: Math.max(0, data.freeCents), swatch: color.track },
            ].map((part) => (
              <View key={part.label} style={{ gap: 4 }}>
                <View style={styles.legendHead}>
                  <View style={[styles.swatch, { backgroundColor: part.swatch }]} />
                  <Eyebrow tracking={0.14}>{part.label}</Eyebrow>
                </View>
                <T weight="mono" size={12} alpha={0.7}>
                  {euroLabel(part.cents)}
                </T>
              </View>
            ))}
          </View>
        </View>
        <Divider />
        <View style={styles.statusRow}>
          <StatusDot />
          <T size={13} lineHeight={17.5} alpha={0.78} style={{ flex: 1 }}>
            {status}
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
              {figure(data.dailyFreeCents)} € free per day
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
            {data.categoryCount}
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
              {/* Every category gets a track, so the rows read as one column —
                  including the ones with no limit, which simply never fill. */}
              <View style={styles.track}>
                <View
                  style={[
                    styles.trackFill,
                    {
                      width: `${cat.fill * 100}%`,
                      backgroundColor: mark(cat.alpha),
                    },
                  ]}
                />
                {/* A full bar means "at the limit" and "half again as much" alike,
                    so past the limit it gets a cap at the end. Strictly past:
                    spending exactly the limit is not yet over it. */}
                {cat.limitCents > 0 && cat.spentCents > cat.limitCents ? (
                  <View style={styles.trackOver} />
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </Card>

      {data.comingUp.length > 0 || next.plannedCents > 0 ? (
        <Card quiet style={styles.comingUp}>
          <Eyebrow alpha={0.32} tracking={0.14}>
            Coming up
          </Eyebrow>
          {shown.length > 0 ? (
            <View style={{ gap: 10 }}>
              {shown.map((item) => (
                <View key={item.key} style={styles.rowBaseline}>
                  <T size={13} alpha={0.8} numberOfLines={1} style={{ flex: 1 }}>
                    {item.label} · {shortDate(item.at)}
                  </T>
                  <T size={13} alpha={0.6} tracking={-0.02}>
                    {amountLabel(item.amountCents)}
                  </T>
                </View>
              ))}
              {more > 0 ? (
                <T size={11.5} alpha={0.38}>
                  +{more} more this month
                </T>
              ) : null}
            </View>
          ) : (
            <T size={13} alpha={0.5}>
              Nothing else planned this month.
            </T>
          )}
          {next.plannedCents > 0 ? (
            <>
              <Divider />
              <T size={12} alpha={0.46}>
                {next.label} · {euroLabel(next.plannedCents)} planned
                {next.budgetCents ? ` of ${euroLabel(next.budgetCents)}` : ''}
              </T>
            </>
          ) : null}
        </Card>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ color, w }) => ({
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
  legend: { flexDirection: 'row', justifyContent: 'space-between' },
  legendHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 6, height: 6, borderRadius: 3 },
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
  /* Flush with the end of a full bar, split off by a hairline of page ink: the
     category ladder runs almost to white, so a brighter block alone would vanish
     on the brightest categories and the gap is what keeps it legible on all ten. */
  trackOver: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 13,
    backgroundColor: color.mark,
    borderLeftWidth: 1.5,
    borderLeftColor: color.ink,
  },
  comingUp: { borderRadius: radius.tile, paddingVertical: 16, paddingHorizontal: 18, gap: 12 },
}));
