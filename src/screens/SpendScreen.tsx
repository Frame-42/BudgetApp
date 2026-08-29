import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Amount, Eyebrow, HeroCard, T } from '../components/primitives';
import { SpendItemSheet } from '../components/SpendItemSheet';
import { tapSelect } from '../haptics';
import type { SpendData, SpendItem } from '../queries/spend';
import { amountLabel, figure } from '../format';
import { color, radius, w } from '../theme';

/** 02 — Spend: where it went. */
export function SpendScreen({
  data,
  month,
  categories,
  onSave,
  onDelete,
}: {
  data: SpendData;
  month: string;
  categories: { id: string; name: string }[];
  onSave: (input: {
    id: string;
    amountCents: number;
    categoryId: string | null;
    income: boolean;
    merchant: string;
  }) => void;
  onDelete: (id: string) => void;
}) {
  const lastGroup = data.groups[data.groups.length - 1];
  /* Which row is being acted on: transient overlay state, so it stays local. */
  const [selected, setSelected] = useState<SpendItem | null>(null);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ gap: 5 }}>
          <Eyebrow size={10}>{month}</Eyebrow>
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
          <Amount value={figure(data.totalCents)} size={40} symbolSize={20} />
        </View>
        <View style={styles.heroMeta}>
          {data.transactionCount ? (
            <>
              <T size={11.5} alpha={0.4}>
                {data.transactionCount} transactions
              </T>
              <T size={11.5} alpha={0.4}>
                avg {figure(data.averageCents)} €
              </T>
            </>
          ) : (
            <T size={11.5} alpha={0.4}>
              Nothing spent this month yet
            </T>
          )}
        </View>
      </HeroCard>

      {data.groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <Eyebrow alpha={0.3}>{group.title}</Eyebrow>
          <View>
            {group.items.map((item, i) => {
              /* Every row is ruled off except the very last one on the screen. */
              const last = group === lastGroup && i === group.items.length - 1;
              const open = () => setSelected(item);
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.merchant}, ${amountLabel(item.amountCents, { signed: item.income })}`}
                  accessibilityHint="Opens edit and delete"
                  onPress={() => {
                    tapSelect();
                    open();
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    !last && styles.rowBorder,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={{ gap: 4 }}>
                    <T size={14} style={{ color: color.textStrong }}>
                      {item.merchant}
                    </T>
                    <T weight="mono" size={11} alpha={0.34}>
                      {item.category}
                    </T>
                  </View>
                  <T
                    size={14}
                    tracking={-0.02}
                    alpha={0.72}
                    style={item.income ? { color: color.accentBright } : undefined}
                  >
                    {amountLabel(item.amountCents, { signed: item.income })}
                  </T>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <SpendItemSheet
        item={selected}
        categories={categories}
        onClose={() => setSelected(null)}
        onSave={onSave}
        onDelete={onDelete}
      />
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
    /* Pulled back out again so the press wash can bleed past the text. */
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  rowPressed: { backgroundColor: w(0.04), borderRadius: radius.key },
});
