import type { SQLiteDatabase } from 'expo-sqlite';
import { buildImportPlan } from '../plan';

describe('buildImportPlan', () => {
  it('excludes SAVEBACK before categorisation without dropping other investments', async () => {
    const getAllAsync = jest.fn(async (source: string): Promise<unknown[]> => {
      if (source.includes('FROM categories')) {
        return [
          {
            id: 'investment',
            name: 'Investment',
            color_alpha: 0.8,
            sort_order: 0,
            archived: 0,
            updated_at: 0,
            deleted_at: null,
            owner_id: null,
          },
        ];
      }
      if (source.includes('GROUP BY merchant, category_id')) return [];
      if (source.includes('SELECT external_id')) return [];
      throw new Error(`Unexpected query: ${source}`);
    });
    const db = { getAllAsync } as unknown as SQLiteDatabase;
    const csv = [
      'datetime,amount,name,category,transaction_id,type',
      '2026-09-01T10:00:00+02:00,2.00,Saveback,TRADING,saveback-1,BENEFITS_SAVEBACK',
      '2026-09-02T10:00:00+02:00,-5.00,Broker,,buy-1,BUY',
      '2026-09-03T10:00:00+02:00,-7.00,Broker,TRADING,trading-1,CARD',
    ].join('\n');

    const plan = await buildImportPlan(db, csv);

    expect(plan.ignoredSaveback).toBe(1);
    expect(plan.ignoredIncoming).toBe(0);
    expect(plan.rows.map((row) => row.externalId)).toEqual(['buy-1', 'trading-1']);
    expect(plan.rows.every((row) => row.categoryId === 'investment' && row.via === 'trading')).toBe(true);
  });
});
