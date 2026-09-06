import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Amount, Card, Divider, Eyebrow, HeroCard, T } from '../components/primitives';
import { ImportSheet } from '../components/ImportSheet';
import { BudgetScreen, type BudgetDraft } from './BudgetScreen';
import type { ImportPlan } from '../import/plan';
import { ExportIcon, ImportIcon } from '../components/Icons';
import { tapSelect, tapWarn } from '../haptics';
import type { YouData, YouSettingKey } from '../queries/you';
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
  onExport,
  onSaveBudget,
  onReset,
  onLoadSample,
}: {
  data: YouData;
  categories: { id: string; name: string }[];
  onPlanImport: (text: string) => Promise<ImportPlan>;
  onRunImport: (plan: ImportPlan) => Promise<number>;
  onExport: () => Promise<number>;
  onSaveBudget: (draft: BudgetDraft) => Promise<void>;
  onReset: () => void;
  onLoadSample: () => void;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  /* The tile's own subtitle is the whole of the export UI. There is no sheet
     because there is nothing to decide: the share sheet is the next step, and
     it is the system's. */
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { enabled: devToolsEnabled, setEnabled: setDevToolsEnabled } = useDevTools();

  /* Keyed off the discriminant rather than the label, so renaming a row's copy
     cannot quietly detach its editor. The budget row opens the whole budget —
     the overall figure and a limit per category on one page — since the two are
     one decision and splitting them across two screens made the total invisible
     from wherever you were editing. The rest are still read-only (ROADMAP P1). */
  const editors: Partial<Record<YouSettingKey, () => void>> = {
    budget: () => {
      tapSelect();
      setBudgetOpen(true);
    },
  };

  /* The toggle itself only exists in a __DEV__ build — same guarantee a real
     production bundle already had, just explicit now instead of implicit. */
  const rows: Row[] = [
    ...data.settings.map((setting) => ({
      name: setting.name,
      value: setting.value,
      onPress: editors[setting.key],
    })),
    ...(__DEV__
      ? [
          {
            name: 'Developer mode',
            value: devToolsEnabled ? 'ON' : 'OFF',
            onPress: () => setDevToolsEnabled(!devToolsEnabled),
          },
        ]
      : []),
  ];

  /* A note describes the database as it was when the tap happened. Once the row
     count moves — an import landed, sample data was loaded — it is talking about
     a state that is gone, and "nothing to export yet" is then simply wrong. */
  useEffect(() => setExportNote(null), [data.trackedCount]);

  const runExport = async () => {
    if (exporting) return;
    tapSelect();
    setExporting(true);
    setExportNote(null);
    try {
      const count = await onExport();
      /* Deliberately silent on success: the share sheet has already opened, and
         iOS resolves whether or not the user went through with it — so "shared
         42" would be a claim this screen cannot actually make. */
      if (count === 0) setExportNote('Nothing to export yet');
    } catch (problem) {
      tapWarn();
      setExportNote(problem instanceof Error ? problem.message : 'That export failed.');
    } finally {
      setExporting(false);
    }
  };

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

      {/* Actions, not settings — so tiles of their own rather than more rows in
          the card above, where the right-hand slot means "current value". */}
      <ActionTile
        label="Import transactions"
        hint="Opens the transaction import"
        note="CSV or bank export"
        icon={<ImportIcon color={fg(0.55)} size={18} />}
        onPress={() => {
          tapSelect();
          setImportOpen(true);
        }}
      />

      <ActionTile
        label="Export transactions"
        hint="Writes a CSV and opens the share sheet"
        note={exporting ? 'Preparing…' : exportNote ?? 'CSV, everything recorded'}
        alert={exportNote !== null && !exporting}
        icon={<ExportIcon color={fg(0.55)} size={18} />}
        busy={exporting}
        onPress={runExport}
      />

      <Card quiet style={styles.signOut}>
        <T size={12.5} alpha={0.5}>
          Sign out
        </T>
      </Card>

      <BudgetScreen
        visible={budgetOpen}
        categories={data.categories}
        budgetCents={data.budgetCents}
        categoryLimits={data.categoryLimits}
        onClose={() => setBudgetOpen(false)}
        onSave={onSaveBudget}
      />

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

/** The shape both bottom-of-screen actions take: icon, label, and a status line. */
function ActionTile({
  label,
  hint,
  note,
  icon,
  onPress,
  busy,
  alert,
}: {
  label: string;
  hint: string;
  note: string;
  icon: React.ReactNode;
  onPress: () => void;
  busy?: boolean;
  /** Colours the status line, for the one case where it is reporting a failure. */
  alert?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!busy, busy: !!busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.actionTile, pressed && styles.actionTilePressed]}
    >
      {icon}
      <View style={{ gap: 5, flexShrink: 1 }}>
        <T size={13.5} alpha={0.86}>
          {label}
        </T>
        {alert ? (
          <T weight="mono" size={11} tracking={0.08} style={{ color: color.accentBright }}>
            {note.toUpperCase()}
          </T>
        ) : (
          <Eyebrow alpha={0.3}>{note}</Eyebrow>
        )}
      </View>
    </Pressable>
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
  actionTile: {
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
  actionTilePressed: { backgroundColor: w(0.085) },
  signOut: {
    borderRadius: radius.tile,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
