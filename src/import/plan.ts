/**
 * Turns an export into a set of decisions, without writing anything.
 *
 * Kept separate from `db/import.ts` so that what the preview shows and what the
 * commit writes are the same object: nothing is re-derived between the screen
 * and the insert.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { listCategories } from '../repo/categories';
import { CsvError, parseCsv } from './csv';
import { categoryForMcc, isSecuritiesPurchase, merchantKey, merchantName } from './rules';

/** Columns without which this is not a transaction export at all. */
const REQUIRED = ['datetime', 'amount', 'name', 'transaction_id'];

/** How far apart two rows can sit and still be the same purchase typed twice. */
const FUZZY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export type ImportRow = {
  externalId: string;
  merchant: string;
  key: string;
  amountCents: number;
  occurredAt: number;
  note: string | null;
  categoryId: string | null;
  /** Why it was categorised, for the preview to explain itself. */
  via: 'trading' | 'memory' | 'mcc' | null;
  /** An existing transaction this looks like; the user decides. */
  duplicateOf: { merchant: string; occurredAt: number } | null;
  /** Excluded from the write: no category, or the user said not to. */
  skip: boolean;
  /**
   * Whether the user has ruled on this row. Separate from `skip` because a
   * flagged duplicate *starts* skipped — inferring "decided" from it would keep
   * asking about a row the user already dismissed.
   */
  decided: boolean;
};

export type ImportPlan = {
  rows: ImportRow[];
  /** Positive amounts. The user's rule: money coming in is not imported. */
  ignoredIncoming: number;
  /** Already in the database under the same bank id. */
  alreadyPresent: number;
};

/** Rows still needing a person: no category, or a possible duplicate. */
export const needsReview = (plan: ImportPlan): ImportRow[] =>
  plan.rows.filter((row) => !row.decided && (row.categoryId === null || row.duplicateOf !== null));

export const readyCount = (plan: ImportPlan): number =>
  plan.rows.filter((row) => !row.skip && row.categoryId !== null && row.duplicateOf === null).length;

/**
 * What the user's own history says a merchant belongs to. Built by counting,
 * so the answer is whatever they have picked most often for that merchant.
 *
 * This intentionally outranks the MCC table: a code is a guess about a business,
 * while this is a decision the user already made.
 */
async function merchantMemory(db: SQLiteDatabase): Promise<Map<string, string>> {
  const rows = await db.getAllAsync<{ merchant: string; category_id: string; n: number }>(
    `SELECT merchant, category_id, COUNT(*) AS n FROM transactions
      WHERE deleted_at IS NULL AND category_id IS NOT NULL
      GROUP BY merchant, category_id`,
  );

  const best = new Map<string, { categoryId: string; n: number }>();
  for (const row of rows) {
    const key = merchantKey(row.merchant);
    if (key === '') continue;
    const held = best.get(key);
    if (!held || row.n > held.n) best.set(key, { categoryId: row.category_id, n: row.n });
  }
  return new Map([...best].map(([key, held]) => [key, held.categoryId]));
}

export async function buildImportPlan(db: SQLiteDatabase, text: string): Promise<ImportPlan> {
  const records = parseCsv(text, REQUIRED);
  if (records.length === 0) throw new CsvError('That file has no transactions in it.');

  const [categories, memory, existing] = await Promise.all([
    listCategories(db),
    merchantMemory(db),
    db.getAllAsync<{ external_id: string | null; merchant: string; amount_cents: number; occurred_at: number }>(
      'SELECT external_id, merchant, amount_cents, occurred_at FROM transactions WHERE deleted_at IS NULL',
    ),
  ]);

  const byName = new Map(categories.map((category) => [category.name, category.id]));
  const imported = new Set(existing.map((row) => row.external_id).filter(Boolean) as string[]);
  const handEntered = existing.filter((row) => row.external_id === null);

  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  let ignoredIncoming = 0;
  let alreadyPresent = 0;

  for (const record of records) {
    const amountCents = Math.round(Number.parseFloat(record.amount || '0') * 100);
    // The user's rule, applied before anything else: incoming money is not a
    // transaction this app is for.
    if (!Number.isFinite(amountCents) || amountCents >= 0) {
      ignoredIncoming++;
      continue;
    }

    const externalId = record.transaction_id;
    // Both against the database and within this file: an export can repeat.
    if (imported.has(externalId) || seen.has(externalId)) {
      alreadyPresent++;
      continue;
    }
    seen.add(externalId);

    const occurredAt = Number.isFinite(Date.parse(record.datetime))
      ? Date.parse(record.datetime)
      : Date.parse(record.date);
    const raw = record.name || record.description || '';
    const merchant = merchantName(raw);
    const key = merchantKey(raw);

    let categoryId: string | null = null;
    let via: ImportRow['via'] = null;
    if (isSecuritiesPurchase({ type: record.type ?? '', category: record.category ?? '' })) {
      categoryId = byName.get('Investment') ?? null;
      via = 'trading';
    }
    if (!categoryId && memory.has(key)) {
      categoryId = memory.get(key) ?? null;
      via = 'memory';
    }
    if (!categoryId) {
      const name = categoryForMcc(record.mcc_code ?? '');
      categoryId = name ? byName.get(name) ?? null : null;
      via = categoryId ? 'mcc' : null;
    }

    // Only ever a flag. Two runs to the same shop in one afternoon are a real
    // pair, so the
    // decision belongs to the person who was there.
    const match = handEntered.find(
      (row) =>
        row.amount_cents === amountCents &&
        Math.abs(row.occurred_at - occurredAt) <= FUZZY_WINDOW_MS &&
        merchantKey(row.merchant) === key,
    );

    rows.push({
      externalId,
      merchant,
      key,
      amountCents,
      occurredAt,
      note: originalAmountNote(record),
      categoryId,
      via,
      duplicateOf: match ? { merchant: match.merchant, occurredAt: match.occurred_at } : null,
      // A possible duplicate starts skipped: not double-counting is the safer
      // default, and it is one tap to keep.
      skip: match !== undefined,
      decided: false,
    });
  }

  return { rows, ignoredIncoming, alreadyPresent };
}

/** The app is euro-only, so a foreign charge keeps what it was in the note. */
function originalAmountNote(record: Record<string, string>): string | null {
  const original = record.original_amount;
  const currency = record.original_currency;
  if (!original || !currency) return null;
  const figure = Math.abs(Number.parseFloat(original));
  if (!Number.isFinite(figure)) return null;
  return `${figure.toFixed(2)} ${currency}`;
}
