import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import { getDb } from '../db/client';
import {
  PAGE_SIZE,
  isFiltered,
  loadEarliestTransaction,
  loadTransactionMonths,
  loadTransactionPage,
  loadUsedCategories,
  type TransactionFilter,
  type TransactionPage,
} from '../queries/transactions';
import { addMonths, startOfMonth } from '../time';

/**
 * What the list is scoped to. A month steps; a range handed over from Trends
 * rests where it was put; all time is unbounded.
 */
export type Period =
  | { kind: 'month'; start: number }
  | { kind: 'range'; from: number; to: number; label: string }
  | { kind: 'all' };

const thisMonthPeriod = (): Period => ({ kind: 'month', start: startOfMonth(Date.now()) });

const bounds = (period: Period): { from: number | null; to: number | null } => {
  if (period.kind === 'all') return { from: null, to: null };
  if (period.kind === 'range') return { from: period.from, to: period.to };
  return { from: period.start, to: addMonths(period.start, 1) };
};

const EMPTY_PAGE: TransactionPage = {
  groups: [],
  totalCents: 0,
  transactionCount: 0,
  averageCents: 0,
  matchCount: 0,
  hasMore: false,
};

/** Long enough that typing a word is one query, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 200;

export type TransactionFeed = {
  filter: TransactionFilter;
  period: Period;
  /** The raw field value; `filter.search` lags it by the debounce. */
  searchText: string;
  page: TransactionPage;
  categories: { id: string; name: string }[];
  /** 'YYYY-MM' keys that hold a transaction, for the month picker's grid. */
  monthsWithData: string[];
  canStepBack: boolean;
  canStepForward: boolean;
  filtered: boolean;
  loading: boolean;
  /** Bumped whenever the list is aimed from outside, so it can scroll to the top. */
  focusToken: number;
  setSearch: (next: string) => void;
  stepMonth: (delta: number) => void;
  pickMonth: (monthStart: number) => void;
  setAllTime: () => void;
  toggleCategory: (id: string) => void;
  /** Point the list at a scope wholesale — what Trends hands over. */
  focus: (next: { period: Period; categoryIds: string[] }) => void;
  loadMore: () => void;
  clearFilters: () => void;
};

/**
 * Spend's own slice of state. The provider's snapshot recomputes every screen on
 * every write, which only works because those queries take no arguments; a
 * filtered, paged list does, so it lives here and listens to the same change
 * events itself.
 */
export function useTransactionFeed(): TransactionFeed {
  const [period, setPeriod] = useState<Period>(thisMonthPeriod);
  const [searchText, setSearchText] = useState('');
  const [search, setDebouncedSearch] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [pages, setPages] = useState(1);
  const [focusToken, setFocusToken] = useState(0);

  const [page, setPage] = useState<TransactionPage>(EMPTY_PAGE);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [earliest, setEarliest] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  /** Bumped by the database change listener to force a refetch of the window. */
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (searchText === search) return;
    const timer = setTimeout(() => setDebouncedSearch(searchText), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, search]);

  const filter = useMemo<TransactionFilter>(
    () => ({ ...bounds(period), search, categoryIds }),
    [period, search, categoryIds],
  );

  /* Only the newest request may write state: a wide query started first can
     otherwise land after the narrow one that replaced it. */
  const generation = useRef(0);

  useEffect(() => {
    const mine = ++generation.current;
    setLoading(true);
    (async () => {
      const db = await getDb();
      const [next, used, first, monthKeys] = await Promise.all([
        loadTransactionPage(db, filter, PAGE_SIZE * pages),
        loadUsedCategories(db),
        loadEarliestTransaction(db),
        loadTransactionMonths(db),
      ]);
      if (generation.current !== mine) return;
      setPage(next);
      setCategories(used);
      setEarliest(first);
      setMonths(monthKeys);
      setLoading(false);
    })();
  }, [filter, pages, revision]);

  useEffect(() => {
    // One write fires several change events (the row, then its outbox entry),
    // so coalesce them into a single refetch — same shape as the provider's.
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

  /* Any change to what is being matched puts the list back on its first page. */
  const rewind = () => setPages(1);

  const setSearch = useCallback((next: string) => {
    setSearchText(next);
    setPages(1);
  }, []);

  const stepMonth = useCallback((delta: number) => {
    setPeriod((current) =>
      current.kind === 'month' ? { kind: 'month', start: addMonths(current.start, delta) } : current,
    );
    rewind();
  }, []);

  const pickMonth = useCallback((next: number) => {
    setPeriod({ kind: 'month', start: startOfMonth(next) });
    rewind();
  }, []);

  const setAllTime = useCallback(() => {
    setPeriod({ kind: 'all' });
    rewind();
  }, []);

  /* One action, so a hand-off is a single refetch rather than one per field. */
  const focus = useCallback<TransactionFeed['focus']>((next) => {
    setPeriod(next.period);
    setCategoryIds(next.categoryIds);
    setSearchText('');
    setDebouncedSearch('');
    rewind();
    setFocusToken((token) => token + 1);
  }, []);

  const toggleCategory = useCallback((id: string) => {
    setCategoryIds((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );
    rewind();
  }, []);

  const loadMore = useCallback(() => {
    setPages((current) => (page.hasMore && !loading ? current + 1 : current));
  }, [page.hasMore, loading]);

  const clearFilters = useCallback(() => {
    setSearchText('');
    setDebouncedSearch('');
    setCategoryIds([]);
    setPeriod(thisMonthPeriod());
    rewind();
  }, []);

  const month = period.kind === 'month' ? period.start : null;

  return {
    filter,
    period,
    searchText,
    page,
    categories,
    monthsWithData: months,
    canStepBack: month !== null && earliest !== null && startOfMonth(earliest) < month,
    canStepForward: month !== null && month < startOfMonth(Date.now()),
    filtered: isFiltered(filter),
    loading,
    focusToken,
    setSearch,
    stepMonth,
    pickMonth,
    setAllTime,
    toggleCategory,
    focus,
    loadMore,
    clearFilters,
  };
}
