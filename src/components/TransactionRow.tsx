import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { T } from './primitives';
import { tapSelect } from '../haptics';
import { amountLabel } from '../format';
import type { TransactionItem } from '../queries/transactions';
import { makeStyles, radius, useTheme } from '../theme';

/** One line of the Spend list. Memoized: it is a virtualized `renderItem`. */
export const TransactionRow = React.memo(function TransactionRow({
  item,
  ruled,
  onPress,
}: {
  item: TransactionItem;
  /** Every row is ruled off except the last of its day. */
  ruled: boolean;
  onPress: (item: TransactionItem) => void;
}) {
  const styles = useStyles();
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.merchant}, ${amountLabel(item.amountCents, { signed: item.income })}`}
      accessibilityHint="Opens edit and delete"
      onPress={() => {
        tapSelect();
        onPress(item);
      }}
      style={({ pressed }) => [styles.row, ruled && styles.rowBorder, pressed && styles.rowPressed]}
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
});

const useStyles = makeStyles(({ color, w }) => ({
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
}));
