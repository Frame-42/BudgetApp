import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, Eyebrow, T } from '../components/primitives';
import { color } from '../theme';

type Tool = { name: string; onPress: () => void };

/**
 * The dev-only actions card on the You screen. Only ever mounted when
 * developer mode is on (see `useDevTools`), which itself only exists in a
 * `__DEV__` build — a real production bundle never renders this. New dev
 * tools become new entries in `tools` below, not new one-off rows elsewhere.
 */
export function DevToolsPanel({
  onReset,
  onLoadSample,
}: {
  onReset: () => void;
  onLoadSample: () => void;
}) {
  const tools: Tool[] = [
    { name: 'Reset to first run', onPress: onReset },
    { name: 'Load sample data', onPress: onLoadSample },
  ];

  return (
    <View style={styles.wrap}>
      <Eyebrow alpha={0.3} style={styles.label}>
        Dev tools
      </Eyebrow>
      <Card style={styles.card}>
        {tools.map((tool, i) => (
          <Pressable
            key={tool.name}
            onPress={tool.onPress}
            accessibilityRole="button"
            style={[styles.row, i < tools.length - 1 && styles.rowBorder]}
          >
            <T size={13.5} alpha={0.86}>
              {tool.name}
            </T>
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  label: { paddingHorizontal: 4 },
  card: { paddingVertical: 6, paddingHorizontal: 20 },
  row: { paddingVertical: 16 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: color.hairline },
});
