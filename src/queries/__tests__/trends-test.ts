import type { SQLiteDatabase } from 'expo-sqlite';
import { apportionPercentages, loadTrends, toSplit } from '../trends';

describe('apportionPercentages', () => {
  it('adds to 100 without making the largest weight smaller', () => {
    const result = apportionPercentages([336, 335, 329]);

    expect(result).toEqual([34, 33, 33]);
    expect(result.reduce((sum, percent) => sum + percent, 0)).toBe(100);
  });

  it('uses stable order to resolve equal remainders', () => {
    expect(apportionPercentages([1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('keeps an empty split empty', () => {
    expect(apportionPercentages([0, 0])).toEqual([0, 0]);
  });
});

describe('toSplit', () => {
  it('re-sorts a named Other category after folding the tail into it', () => {
    const split = toSplit([
      { id: 'a', name: 'Groceries', alpha: 0.8, total: 40 },
      { id: 'b', name: 'Dining', alpha: 0.7, total: 30 },
      { id: 'c', name: 'Transport', alpha: 0.6, total: 20 },
      { id: 'd', name: 'Other', alpha: 0.5, total: 19 },
      { id: 'e', name: 'Housing', alpha: 0.4, total: 18 },
      { id: 'f', name: 'Health', alpha: 0.3, total: 17 },
    ]);

    expect(split[0].name).toBe('Other');
    expect(split[0].totalCents).toBe(54);
    expect(split.reduce((sum, share) => sum + share.percent, 0)).toBe(100);
  });

  it('orders equal totals deterministically', () => {
    const split = toSplit([
      { id: 'b', name: 'Transport', alpha: 0.3, total: 20 },
      { id: 'a', name: 'Dining', alpha: 0.6, total: 20 },
    ]);

    expect(split.map((share) => share.name)).toEqual(['Dining', 'Transport']);
  });
});

describe('loadTrends', () => {
  it('builds coherent spans inside one read transaction', async () => {
    const getAllAsync = jest.fn(async (source: string, _params: unknown[]): Promise<unknown[]> => {
      if (source.includes('COUNT(*) AS entries')) {
        return [
          { month: '2026-07', entries: 1, matches: 1, total: 100 },
          { month: '2026-08', entries: 1, matches: 0, total: 0 },
          { month: '2026-09', entries: 1, matches: 1, total: 90 },
        ];
      }
      if (source.includes("CAST(strftime('%d'")) {
        return [
          { month: '2026-07', day: 2, total: 100 },
          { month: '2026-09', day: 2, total: 90 },
        ];
      }
      if (source.includes('JOIN categories')) {
        return [
          { month: '2026-07', id: 'groceries', name: 'Groceries', alpha: 0.46, total: 100 },
          { month: '2026-08', id: 'dining', name: 'Dining', alpha: 0.66, total: 300 },
          { month: '2026-09', id: 'groceries', name: 'Groceries', alpha: 0.46, total: 90 },
        ];
      }
      throw new Error(`Unexpected query: ${source}`);
    });
    const transaction = {
      getAllAsync,
    } as unknown as SQLiteDatabase;
    const withExclusiveTransactionAsync = jest.fn(
      async (task: (txn: SQLiteDatabase) => Promise<void>) => task(transaction),
    );
    const db = { withExclusiveTransactionAsync } as unknown as SQLiteDatabase;
    const september = new Date(2026, 8, 10).getTime();
    const sourceStart = new Date(2024, 8, 1).getTime();
    const sourceEnd = new Date(2026, 9, 1).getTime();

    const trends = await loadTrends(db, september, ['groceries']);

    expect(withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(getAllAsync).toHaveBeenCalledTimes(3);
    expect(getAllAsync.mock.calls.map(([, params]) => params)).toEqual([
      ['groceries', 'groceries', sourceStart, sourceEnd],
      ['groceries', sourceStart, sourceEnd],
      [sourceStart, sourceEnd],
    ]);
    const aggregateSql = getAllAsync.mock.calls[0][0];
    expect(aggregateSql).toContain('SUM(CASE WHEN category_id IN (?) THEN 1 ELSE 0 END)');
    expect(aggregateSql.slice(aggregateSql.indexOf('WHERE'))).not.toContain('category_id IN');
    expect(trends[3].monthlyAverageCents).toBe(50);
    expect(trends[3].matchCount).toBe(2);
    expect(trends[3].months.find((month) => month.key === '2026-08')).toMatchObject({
      present: true,
      totalCents: 0,
      matchCount: 0,
    });
    expect(trends[3].split.map((share) => [share.name, share.totalCents])).toEqual([
      ['Dining', 300],
      ['Groceries', 190],
    ]);
  });
});


describe('Trends period paging', () => {
  const at = new Date(2026, 8, 10).getTime();
  function database() {
    const txn = { getAllAsync: jest.fn(async (sql: string) => {
      if (sql.includes('COUNT(*) AS entries')) return [
        { month: '2026-02', entries: 1, matches: 1, total: 2800 },
        { month: '2026-03', entries: 1, matches: 1, total: 3100 },
      ];
      if (sql.includes("CAST(strftime('%d'")) return [
        { month: '2026-02', day: 28, total: 2800 },
        { month: '2026-03', day: 31, total: 3100 },
      ];
      return [];
    }) };
    return { withExclusiveTransactionAsync: async (read: (db: unknown) => Promise<void>) => read(txn) } as unknown as SQLiteDatabase;
  }

  it.each([3, 6, 12] as const)('previews the preceding %s months without overlap', async (span) => {
    const bundle = await loadTrends(database(), at);
    const page = bundle[span];
    expect(page.older.to).toBe(page.from);
    expect(page.newer).toBeNull();
    const previous = (await loadTrends(database(), at, [], -span))[span];
    const { older, newer, ...current } = previous;
    expect(current).toEqual(page.older);
    expect(newer?.from).toBe(page.from);
    expect(newer?.to).toBe(page.to);
    expect(older.to).toBe(previous.from);
  });

  it('includes the entire last historical month in averages and pace', async () => {
    const page = (await loadTrends(database(), at, [], -6))[6];
    expect(page.months.map((m) => m.key)).toEqual([
      '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
    ]);
    expect(page.months.every((m) => !m.active)).toBe(true);
    expect(page.monthlyAverageCents).toBe(2950);
    expect(page.averageMonths).toBe(2);
    expect(page.months[5].pace.current).toHaveLength(31);
    expect(page.months[5].totalCents).toBe(3100);
    expect(page.label).toBe('OCT 2025 – MAR 2026');
  });

  it('keeps empty historical periods empty rather than treating them as this month', async () => {
    const page = (await loadTrends(database(), at, [], -36))[6];
    expect(page.averageIsPartial).toBe(false);
    expect(page.averageMonths).toBe(0);
    expect(page.monthlyAverageCents).toBe(0);
    expect(page.averagePace).toEqual([]);
    expect(page.months.every((m) => !m.present && !m.hasAverage)).toBe(true);
  });

  it('clamps newer previews after changing span to the current month', async () => {
    const page = (await loadTrends(database(), at, [], -3))[12];
    expect(page.newer?.endOffset).toBe(0);
    expect(page.newer?.months[11].key).toBe('2026-09');
  });
});
