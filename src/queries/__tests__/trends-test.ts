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
    const sourceStart = new Date(2025, 8, 1).getTime();
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
