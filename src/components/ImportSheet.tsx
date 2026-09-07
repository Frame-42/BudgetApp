import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Eyebrow, T } from './primitives';
import { CategoryChips } from './CategoryChips';
import { Sheet } from './Sheet';
import { morph } from '../motion';
import { tapDone, tapSelect, tapWarn } from '../haptics';
import { amountLabel } from '../format';
import { shortDate } from '../time';
import { needsReview, readyCount, reviewGroups, type ImportPlan, type ImportRow } from '../import/plan';
import { color, fg, radius, w } from '../theme';

type Mode = 'pick' | 'preview' | 'review' | 'done';

/**
 * Transaction import, one sheet for the whole flow.
 *
 * The review step walks one question at a time rather than listing everything:
 * the sheet's card deliberately isn't a ScrollView (see Sheet.tsx), and a
 * stepper sidesteps that entirely instead of reworking the drag for a list that
 * is usually two questions long.
 *
 * A question is a group of rows, not a row — see `reviewGroups`. Eleven Amazon
 * charges are one thing to decide, and asking eleven times is the difference
 * between a minute of tapping and a file the user gives up on.
 */
export function ImportSheet({
  visible,
  onClose,
  categories,
  onPlan,
  onRun,
}: {
  visible: boolean;
  onClose: () => void;
  categories: { id: string; name: string }[];
  onPlan: (text: string) => Promise<ImportPlan>;
  onRun: (plan: ImportPlan) => Promise<number>;
}) {
  const [mode, setMode] = useState<Mode>('pick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  /* Fixed when review starts: recomputing would shrink the list underfoot as
     each question is answered, and "3 of 5" would stop meaning anything. */
  const [queue, setQueue] = useState<ImportRow[][]>([]);
  const [at, setAt] = useState(0);
  const [imported, setImported] = useState(0);

  /* Every open starts over. A half-reviewed plan from last time would be worse
     than no plan: its counts describe a file that is no longer on screen. */
  useEffect(() => {
    if (!visible) return;
    setMode('pick');
    setBusy(false);
    setError(null);
    setPlan(null);
    setQueue([]);
    setAt(0);
    setImported(0);
  }, [visible]);

  if (!visible) return null;

  const pick = async () => {
    tapSelect();
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      // Some exporters hand out text/plain or an octet-stream, so this cannot be
      // text/csv alone or the file the user wants is greyed out.
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets[0]) return;

    setBusy(true);
    try {
      const text = await new File(picked.assets[0].uri).text();
      const next = await onPlan(text);
      morph();
      setPlan(next);
      setMode('preview');
    } catch (problem) {
      tapWarn();
      setError(problem instanceof Error ? problem.message : 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const startReview = () => {
    if (!plan) return;
    tapSelect();
    morph();
    setQueue(reviewGroups(plan));
    setAt(0);
    setMode('review');
  };

  /* One answer, applied to every row the question covered. */
  const resolve = (change: Partial<ImportRow>) => {
    const answered = new Set(queue[at].map((row) => row.externalId));
    const patch = { ...change, decided: true };
    setPlan((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((r) => (answered.has(r.externalId) ? { ...r, ...patch } : r)),
          }
        : current,
    );
    morph();
    if (at + 1 < queue.length) setAt(at + 1);
    else setMode('preview');
  };

  const run = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const count = await onRun(plan);
      tapDone();
      morph();
      setImported(count);
      setMode('done');
    } catch (problem) {
      tapWarn();
      setError(problem instanceof Error ? problem.message : 'Nothing was imported.');
    } finally {
      setBusy(false);
    }
  };

  const ready = plan ? readyCount(plan) : 0;
  const outstanding = plan ? needsReview(plan).length : 0;
  /* The button promises how much work is ahead, so it counts questions, while
     the stat beside it counts transactions like every other figure there. */
  const questions = plan ? reviewGroups(plan).length : 0;

  return (
    <Sheet visible onClose={onClose}>
      <View style={styles.head}>
        <View style={{ gap: 5, flexShrink: 1 }}>
          <T size={16} tracking={-0.01} style={{ color: color.textStrong }}>
            Import transactions
          </T>
          <Eyebrow alpha={0.3}>
            {mode === 'review' ? `Review · ${at + 1} of ${queue.length}` : 'CSV or bank export'}
          </Eyebrow>
        </View>
      </View>

      {error ? (
        <T size={12.5} style={{ color: color.accentBright }}>
          {error}
        </T>
      ) : null}

      {mode === 'pick' ? (
        <View style={{ gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={pick}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            {busy ? (
              <ActivityIndicator color={fg(0.6)} />
            ) : (
              <T size={14} style={{ color: color.textStrong }}>
                Choose a file
              </T>
            )}
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.quiet} hitSlop={8}>
            <T size={12.5} alpha={0.4}>
              Cancel
            </T>
          </Pressable>
        </View>
      ) : null}

      {mode === 'preview' && plan ? (
        <View style={{ gap: 12 }}>
          <View style={styles.counts}>
            <Count value={ready} label="ready" />
            {outstanding > 0 ? <Count value={outstanding} label="to check" /> : null}
            {plan.ignoredIncoming > 0 ? (
              <Count value={plan.ignoredIncoming} label="incoming" quiet />
            ) : null}
            {plan.alreadyPresent > 0 ? (
              <Count value={plan.alreadyPresent} label="already in" quiet />
            ) : null}
          </View>

          {outstanding > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={startReview}
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            >
              <T size={14} style={{ color: color.textStrong }}>
                Check {questions}
              </T>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: ready === 0 || busy }}
            disabled={ready === 0 || busy}
            onPress={run}
            style={({ pressed }) => [
              styles.primary,
              (ready === 0 || busy) && { opacity: 0.35 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <T weight="medium" size={13.5} tracking={-0.01} style={{ color: color.ink }}>
              {ready === 0 ? 'Nothing to import' : `Import ${ready}`}
            </T>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.quiet} hitSlop={8}>
            <T size={12.5} alpha={0.4}>
              Cancel
            </T>
          </Pressable>
        </View>
      ) : null}

      {mode === 'review' && queue[at] ? (
        <ReviewRow
          group={queue[at]}
          categories={categories}
          onAssign={(categoryId) => resolve({ categoryId, duplicateOf: null, skip: false })}
          onSkip={() => resolve({ skip: true })}
        />
      ) : null}

      {mode === 'done' && plan ? (
        <View style={{ gap: 12 }}>
          <View style={styles.counts}>
            <Count value={imported} label="imported" />
            {plan.ignoredIncoming > 0 ? (
              <Count value={plan.ignoredIncoming} label="incoming" quiet />
            ) : null}
            {plan.alreadyPresent > 0 ? (
              <Count value={plan.alreadyPresent} label="already in" quiet />
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
          >
            <T weight="medium" size={13.5} tracking={-0.01} style={{ color: color.ink }}>
              Done
            </T>
          </Pressable>
        </View>
      ) : null}
    </Sheet>
  );
}

/** One figure with its label, the shape the Spend hero uses for its stats. */
function Count({ value, label, quiet }: { value: number; label: string; quiet?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <T size={19} tracking={-0.02} alpha={quiet ? 0.4 : 1}>
        {value}
      </T>
      <Eyebrow alpha={quiet ? 0.24 : 0.34}>{label}</Eyebrow>
    </View>
  );
}

/**
 * The two things a question can need: a category, or a verdict on a near-match.
 *
 * `group` is every row this one answer will cover — one row for a flagged
 * duplicate, and as many as the file holds for a merchant nothing matched. The
 * figures are summed across it so the card describes what is actually being
 * decided rather than whichever charge happened to come first.
 */
function ReviewRow({
  group,
  categories,
  onAssign,
  onSkip,
}: {
  group: ImportRow[];
  categories: { id: string; name: string }[];
  onAssign: (categoryId: string) => void;
  onSkip: () => void;
}) {
  const row = group[0];
  const many = group.length > 1;
  const total = group.reduce((sum, one) => sum + one.amountCents, 0);
  // Min and max rather than first and last: an export is not always in date order.
  const dates = group.map((one) => one.occurredAt);
  const from = shortDate(Math.min(...dates));
  const to = shortDate(Math.max(...dates));
  const span = from === to ? from : `${from} – ${to}`;

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.rowHead}>
        <View style={{ gap: 5, flexShrink: 1 }}>
          <T size={14} style={{ color: color.textStrong }} numberOfLines={1}>
            {row.merchant}
          </T>
          <Eyebrow alpha={0.3}>{many ? `${group.length} × · ${span}` : span}</Eyebrow>
        </View>
        <T size={14} tracking={-0.02} alpha={0.72}>
          {amountLabel(total)}
        </T>
      </View>

      {row.duplicateOf ? (
        <>
          <T size={12.5} alpha={0.55}>
            Looks like {row.duplicateOf.merchant} on {shortDate(row.duplicateOf.occurredAt)},
            already in the app.
          </T>
          <View style={{ gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onAssign(row.categoryId ?? categories[0].id)}
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            >
              <T size={14} style={{ color: color.textStrong }}>
                Import it anyway
              </T>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onSkip} style={styles.quiet} hitSlop={8}>
              <T size={12.5} alpha={0.4}>
                Skip this one
              </T>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <T size={12.5} alpha={0.55}>
            {many
              ? `No rule matched these ${group.length} — one answer files them all.`
              : 'No rule matched this one.'}
          </T>
          <CategoryChips categories={categories} value={row.categoryId} onChange={onAssign} />
          <Pressable accessibilityRole="button" onPress={onSkip} style={styles.quiet} hitSlop={8}>
            <T size={12.5} alpha={0.4}>
              {many ? "Don't import them" : "Don't import it"}
            </T>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  counts: { flexDirection: 'row', gap: 26, paddingVertical: 2 },
  action: {
    height: 52,
    borderRadius: radius.key,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: w(0.045),
    borderWidth: 1,
    borderColor: w(0.055),
  },
  actionPressed: { backgroundColor: w(0.12) },
  primary: {
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: color.textStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quiet: { height: 40, alignItems: 'center', justifyContent: 'center' },
});
