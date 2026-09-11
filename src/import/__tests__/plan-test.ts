import type { SQLiteDatabase } from 'expo-sqlite';
import {
  buildImportPlan,
  keepSinceLastImport,
  offersImportCutoff,
  rowsBeforeLastImport,
  type ImportPlan,
  type ImportRow,
} from '../plan';

/** A fake db returning the given already-imported rows for `buildImportPlan`'s existing-rows query. */
function fakeDb(existing: { external_id: string | null; merchant: string; amount_cents: number; occurred_at: number }[]) {
  const getAllAsync = jest.fn(async (source: string): Promise<unknown[]> => {
    if (source.includes('FROM categories')) return [];
    if (source.includes('GROUP BY merchant, category_id')) return [];
    if (source.includes('SELECT external_id')) return existing;
    throw new Error(`Unexpected query: ${source}`);
  });
  return { getAllAsync } as unknown as SQLiteDatabase;
}

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

  it('is null on a first import, with nothing previously imported', async () => {
    const db = fakeDb([]);
    const csv = ['datetime,amount,name,transaction_id', '2026-09-01T10:00:00+02:00,-5.00,Shop,a'].join('\n');

    const plan = await buildImportPlan(db, csv);

    expect(plan.latestImportedAt).toBeNull();
  });

  it('is the latest date among previously *imported* rows, ignoring hand-entered ones', async () => {
    const db = fakeDb([
      { external_id: 'old', merchant: 'Shop', amount_cents: -100, occurred_at: 1000 },
      { external_id: 'newer', merchant: 'Shop', amount_cents: -100, occurred_at: 5000 },
      // Typed by hand, dated after every import — should not move the cutoff.
      { external_id: null, merchant: 'Cash', amount_cents: -100, occurred_at: 9000 },
    ]);
    const csv = ['datetime,amount,name,transaction_id', '2026-09-01T10:00:00+02:00,-5.00,Shop,fresh'].join('\n');

    const plan = await buildImportPlan(db, csv);

    expect(plan.latestImportedAt).toBe(5000);
  });
});

describe('the import cutoff choice', () => {
  const row = (occurredAt: number, overrides: Partial<ImportRow> = {}): ImportRow => ({
    externalId: `id-${occurredAt}`,
    merchant: 'Shop',
    key: 'shop',
    amountCents: -500,
    occurredAt,
    note: null,
    categoryId: 'groceries',
    via: null,
    duplicateOf: null,
    skip: false,
    decided: false,
    ...overrides,
  });
  const plan = (rows: ImportRow[], latestImportedAt: number | null): ImportPlan => ({
    rows,
    ignoredIncoming: 0,
    alreadyPresent: 0,
    ignoredSaveback: 0,
    latestImportedAt,
  });

  it('is not offered on a first import', () => {
    expect(offersImportCutoff(plan([row(1000), row(2000)], null))).toBe(false);
  });

  it('is not offered when the whole file is already past the last import', () => {
    expect(offersImportCutoff(plan([row(2000), row(3000)], 1000))).toBe(false);
  });

  it('is not offered when the whole file sits inside what was already imported', () => {
    expect(offersImportCutoff(plan([row(500), row(800)], 1000))).toBe(false);
  });

  it('is offered once the file straddles the last import', () => {
    const wide = plan([row(500), row(2000)], 1000);
    expect(offersImportCutoff(wide)).toBe(true);
    expect(rowsBeforeLastImport(wide)).toBe(1);
  });

  it('keeps a row exactly on the cutoff out, since it is presumed already covered', () => {
    const onTheLine = plan([row(1000), row(1500)], 1000);
    expect(rowsBeforeLastImport(onTheLine)).toBe(1);
  });

  it('marks everything at or before the cutoff skipped and decided, and leaves the rest untouched', () => {
    const trimmed = keepSinceLastImport(plan([row(500), row(1000), row(1500, { skip: true })], 1000));

    expect(trimmed.rows.map((r) => [r.occurredAt, r.skip, r.decided])).toEqual([
      [500, true, true],
      [1000, true, true],
      [1500, true, false],
    ]);
  });

  it('is a no-op on a first import', () => {
    const untouched = plan([row(500)], null);
    expect(keepSinceLastImport(untouched)).toBe(untouched);
  });
});
