import type { SQLiteDatabase } from 'expo-sqlite';
import { buildImportPlan, offersImportCutoff, reviewGroups } from '../../import/plan';
import { sampleBankExport } from '../sampleBankExport';

/**
 * The sample bank file only earns its place if every importer rule fires on
 * it. Planned against a database shaped like the test bench: its categories,
 * its merchant memory and its imported and hand-typed rows.
 */
const NAMES = ['Groceries', 'Dining', 'Transport', 'Shopping', 'Leisure', 'Health', 'Subscription', 'Housing', 'Investment', 'Misc'];

describe('sampleBankExport', () => {
  const now = new Date(2026, 10, 19, 19, 45).getTime();
  const twinAt = new Date(2026, 10, 19, 11).getTime();
  const lastImportedAt = new Date(2026, 10, 9, 17).getTime();

  function bench(): SQLiteDatabase {
    const getAllAsync = jest.fn(async (sql: string): Promise<unknown[]> => {
      if (sql.includes('FROM categories')) {
        return NAMES.map((name, i) => ({ id: name.toLowerCase(), name, color_alpha: 0.5, sort_order: i, archived: 0 }));
      }
      if (sql.includes('GROUP BY merchant, category_id')) {
        return [
          { merchant: 'Migros', category_id: 'groceries', n: 30 },
          { merchant: 'Coop', category_id: 'groceries', n: 25 },
          { merchant: 'Amazon', category_id: 'shopping', n: 9 },
          { merchant: 'Blue Bottle', category_id: 'dining', n: 20 },
          { merchant: 'Pret A Manger', category_id: 'dining', n: 1 },
        ];
      }
      if (sql.includes('SELECT external_id')) {
        return [
          { external_id: 'tb-buy-2026-11', merchant: 'Vanguard', amount_cents: -20_000, occurred_at: new Date(2026, 10, 2).getTime() },
          { external_id: 'tb-card-coop', merchant: 'Coop', amount_cents: -6_240, occurred_at: lastImportedAt },
          { external_id: null, merchant: 'Blue Bottle', amount_cents: -640, occurred_at: twinAt },
        ];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    return { getAllAsync } as unknown as SQLiteDatabase;
  }

  const text = sampleBankExport({
    now,
    knownIds: ['tb-buy-2026-11', 'tb-card-coop'],
    twin: { merchant: 'Blue Bottle', cents: -640, at: twinAt },
    lastImportedAt,
  });

  it('exercises every rule the importer has', async () => {
    const plan = await buildImportPlan(bench(), text);
    const by = (name: string) => plan.rows.filter((row) => row.merchant.toUpperCase().startsWith(name));

    // Two bank ids already present, and one line repeated within the file.
    expect(plan.alreadyPresent).toBe(3);
    expect(plan.ignoredIncoming).toBe(2);
    // The reward and the buy that invests it.
    expect(plan.ignoredSaveback).toBe(2);

    expect(by('SHELL')[0]).toMatchObject({ categoryId: 'transport', via: 'mcc' });
    expect(by('DM')[0]).toMatchObject({ categoryId: 'groceries', via: 'mcc' });
    expect(by('PRAXIS')[0]).toMatchObject({ categoryId: 'health', via: 'mcc' });
    expect(by('COOP')[0]).toMatchObject({ categoryId: 'groceries', via: 'memory' });
    expect(by('MIGROS')[0]).toMatchObject({ categoryId: 'groceries', via: 'memory' });
    expect(by('AMAZON')[0]).toMatchObject({ categoryId: 'shopping', via: 'memory' });
    expect(by('OPERNHAUS')[0]).toMatchObject({ categoryId: 'leisure', via: 'named' });
    expect(by('VANGUARD')).toHaveLength(1);
    expect(by('VANGUARD')[0]).toMatchObject({ categoryId: 'investment', via: 'trading', amountCents: -15_000 });
    expect(by('PRET')[0].note).toBe('7.60 GBP');

    const twin = by('BLUE BOTTLE')[0];
    expect(twin.duplicateOf).toEqual({ merchant: 'Blue Bottle', occurredAt: twinAt });
    expect(twin.skip).toBe(true);

    // Galaxus ×3 as one question, Post, the nameless row, and the duplicate.
    const groups = reviewGroups(plan);
    expect(groups.map((group) => group.length).sort()).toEqual([1, 1, 1, 3]);
    expect(offersImportCutoff(plan)).toBe(true);
  });

  it('never dates a line after now', async () => {
    const plan = await buildImportPlan(bench(), text);
    expect(plan.rows.every((row) => row.occurredAt <= now)).toBe(true);
  });
});
