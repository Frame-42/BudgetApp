import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { getDb } from '../db/client';
import { loadTrends, type TrendsBundle } from '../queries/trends';

export type TrendsView = {
  /** Null until the first load lands; the screen waits on it like the snapshot. */
  data: TrendsBundle | null;
  /** The categories the whole screen is narrowed to; empty means all of them. */
  categoryIds: string[];
  setEndOffset: (offset: number) => void;
  toggleCategories: (ids: string[]) => void;
  clearCategories: () => void;
};

/**
 * Trends' own slice of state, for the same reason Spend has one: `loadTrends`
 * takes a category selection, and the provider's snapshot only holds queries
 * that take no arguments. Span and month selection stay in the screen, and
 * every span is precomputed in one pass.
 */
export function useTrendsView(): TrendsView {
  const [data, setData] = useState<TrendsBundle | null>(null);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [endOffset, setEndOffset] = useState(0);
  const [revision, setRevision] = useState(0);

  /* Only the newest request may write state, as in the transaction feed. */
  const generation = useRef(0);
  const loadedOffset = useRef(0);

  useEffect(() => {
    const mine = ++generation.current;
    (async () => {
      const db = await getDb();
      const next = await loadTrends(db, Date.now(), categoryIds, endOffset);
      if (generation.current !== mine) return;
      loadedOffset.current = endOffset;
      setData(next);
    })().catch(() => {
      if (generation.current !== mine) return;
      setEndOffset(loadedOffset.current);
      setData((current) => current ? { ...current } : current);
      Alert.alert('Could not load this period', 'Please try again.');
    });
    return () => { generation.current++; };
  }, [categoryIds, revision, endOffset]);

  useEffect(() => {
    // One write fires several change events (the row, then its outbox entry),
    // so coalesce them into a single reload.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const subscription = SQLite.addDatabaseChangeListener(() => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => setRevision((r) => r + 1), 60);
    });
    return () => {
      if (pending) clearTimeout(pending);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setRevision((r) => r + 1);
    });
    return () => subscription.remove();
  }, []);

  /**
   * A legend row stands for one category, or — when it is the rolled-up "Other"
   * — for several, so a toggle takes a set. It turns the whole set on unless the
   * set is already fully on.
   */
  const toggleCategories = useCallback((ids: string[]) => {
    setCategoryIds((current) => {
      const on = ids.every((id) => current.includes(id));
      return on
        ? current.filter((id) => !ids.includes(id))
        : [...current, ...ids.filter((id) => !current.includes(id))];
    });
  }, []);

  const clearCategories = useCallback(() => setCategoryIds([]), []);

  return { data, setEndOffset, categoryIds, toggleCategories, clearCategories };
}
