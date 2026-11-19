import type { SQLiteDatabase } from 'expo-sqlite';
import { isoLocal, startOfDay } from '../time';

/**
 * A bank export written against the test bench (`db/demo.ts`), one line per
 * importer rule, so pasting it into the import sheet walks through every branch
 * of `import/plan.ts` and `import/rules.ts`. Built from the database rather than
 * shipped as a file because the bench is dated relative to the day it was
 * loaded: the "already imported" ids, the fuzzy duplicate and the last-import
 * cut-off all have to line up with rows that exist.
 *
 * Ids are stamped with the day, so pasting it twice the same day imports
 * nothing new — which is itself the "already imported" rule.
 */

/** What the file is written against. */
export type BenchFacts = {
  now: number;
  /** Bank ids already in the database. */
  knownIds: string[];
  /** A hand-typed row the file should flag as a possible duplicate. */
  twin: { merchant: string; cents: number; at: number } | null;
  /** The latest date anything was imported to; the file reaches both sides of it. */
  lastImportedAt: number | null;
};

const HEADER = ['datetime', 'amount', 'name', 'category', 'transaction_id', 'type', 'mcc_code', 'original_amount', 'original_currency', 'symbol'];
const FUND = 'IE00BK5BQT80';

type Line = {
  at: number;
  cents: number;
  name: string;
  category?: string;
  id?: string;
  type?: string;
  mcc?: string;
  original?: [number, string];
  symbol?: string;
};

const euros = (cents: number) => (cents / 100).toFixed(2);

export function sampleBankExport({ now, knownIds, twin, lastImportedAt }: BenchFacts): string {
  const day = (back: number, hour = 12) => Math.min(now - 60_000, startOfDay(now - back * 86_400_000) + hour * 3_600_000);
  const stamp = isoLocal(now).slice(0, 10);
  // Before the last import, so "just what's new" has something to drop.
  const early = lastImportedAt === null ? day(14) : Math.min(day(1), lastImportedAt - 2 * 86_400_000);

  const lines: Line[] = [
    // Already imported, by the bank's id: skipped silently, counted.
    ...knownIds.slice(0, 2).map((id) => ({ at: early, cents: -5_020, name: 'MIGROS ZUERICH', id })),

    // A possible duplicate of a hand-typed row: same cents, same merchant key,
    // within three days. Flagged and starts skipped; one question of its own.
    ...(twin ? [{ at: Math.min(twin.at, now) - 45 * 60_000, cents: twin.cents, name: 'BLUE BOTTLE COFFEE', mcc: '5814' }] : []),

    // Unknown merchant, unmapped code, three times: one review question for all three.
    { at: early, cents: -8_990, name: 'GALAXUS.CH', mcc: '' },
    { at: day(6), cents: -2_450, name: 'GALAXUS.CH', mcc: '' },
    { at: day(2), cents: -14_900, name: 'GALAXUS.CH', mcc: '' },
    // Unmapped code (postal services): to review, never filed as Misc.
    { at: day(5), cents: -1_150, name: 'POST CH AG', mcc: '9402' },
    // Nothing matchable in the descriptor: an empty key, so its own question.
    { at: day(4), cents: -3_000, name: '000123 / 4471', mcc: '' },

    // MCC table.
    { at: day(5, 18), cents: -7_480, name: 'SHELL ZUERICH', mcc: '5541' },
    // Drugstores are Groceries, not Health.
    { at: day(3), cents: -2_365, name: 'DM DROGERIE MARKT', mcc: '5912' },
    { at: day(7), cents: -12_000, name: 'PRAXIS DR KELLER', mcc: '8011' },
    // A foreign charge keeps its original amount as the note.
    { at: day(3, 13), cents: -910, name: 'PRET A MANGER', mcc: '5812', original: [-760, 'GBP'] },

    // The merchant memory outranks the code (a Coop petrol-station shop is a fuel code)...
    { at: day(2, 8), cents: -1_890, name: 'COOP PRONTO', mcc: '5541' },
    // ...and the bank's own category column.
    { at: day(1, 17), cents: -4_275, name: 'MIGROS', category: 'Shopping' },
    // Memory over an unmapped code.
    { at: day(6, 20), cents: -3_499, name: 'AMAZON EU SARL', mcc: '5942' },
    // A category column naming one of ours, with nothing above it.
    { at: day(8, 19), cents: -9_600, name: 'OPERNHAUS ZUERICH', category: 'Leisure' },

    // Money in: never imported.
    { at: day(9, 7), cents: 420_000, name: 'SALARY ACME AG' },
    { at: day(4, 9), cents: 5_990, name: 'REFUND ZALANDO' },

    // A Saveback reward and the savings-plan buy that invests it: both left out.
    { at: day(10, 6), cents: 1_500, name: 'Saveback', type: 'BENEFITS_SAVEBACK', symbol: FUND },
    { at: day(9, 6), cents: -1_500, name: 'Vanguard FTSE All-World', type: 'BUY', category: 'TRADING', symbol: FUND },
    // An ordinary buy of the same fund: Investment.
    { at: day(9, 6), cents: -15_000, name: 'Vanguard FTSE All-World', type: 'BUY', category: 'TRADING', symbol: FUND },
  ];

  const rows = lines.map((line, i) => [
    isoLocal(line.at),
    euros(line.cents),
    line.name,
    line.category ?? '',
    line.id ?? `tb-${stamp}-${i}`,
    line.type ?? 'CARD_TRANSACTION',
    line.mcc ?? '',
    line.original ? euros(line.original[0]) : '',
    line.original ? line.original[1] : '',
    line.symbol ?? '',
  ]);
  // The same line twice, as exports overlapping a statement boundary do: the
  // second is "already imported" within the file itself.
  const shell = rows.find((row) => row[2] === 'SHELL ZUERICH');
  if (shell) rows.push([...shell]);

  return [HEADER, ...rows].map((row) => row.join(',')).join('\n');
}

/** Reads what the file has to line up with, from the bench in the database. */
export async function readBenchFacts(db: SQLiteDatabase, now: number = Date.now()): Promise<BenchFacts> {
  const known = await db.getAllAsync<{ external_id: string }>(
    `SELECT external_id FROM transactions
      WHERE deleted_at IS NULL AND external_id IS NOT NULL
      ORDER BY occurred_at DESC LIMIT 2`,
  );
  const twin = await db.getFirstAsync<{ merchant: string; amount_cents: number; occurred_at: number }>(
    `SELECT merchant, amount_cents, occurred_at FROM transactions
      WHERE deleted_at IS NULL AND external_id IS NULL AND merchant = 'Blue Bottle' AND occurred_at <= ?
      ORDER BY occurred_at DESC LIMIT 1`,
    [now],
  );
  const last = await db.getFirstAsync<{ at: number | null }>(
    'SELECT MAX(occurred_at) AS at FROM transactions WHERE deleted_at IS NULL AND external_id IS NOT NULL',
  );
  return {
    now,
    knownIds: known.map((row) => row.external_id),
    twin: twin ? { merchant: twin.merchant, cents: twin.amount_cents, at: twin.occurred_at } : null,
    lastImportedAt: last?.at ?? null,
  };
}
