import type { SQLiteDatabase } from 'expo-sqlite';
import { listAccounts } from '../repo/accounts';
import { listCategories } from '../repo/categories';

export type AddOptions = {
  categories: { id: string; name: string }[];
  defaultAccountId: string | null;
};

/**
 * How far back a category counts as "one you use". Long enough that a category
 * used weekly stays near the front through a quiet fortnight, short enough that
 * last winter's habits don't outrank this month's.
 */
const RECENT_DAYS = 90;

/**
 * What the Add screen needs to offer: the category chips and where to book it.
 *
 * Chips come back ordered by how often you have reached for them lately, not by
 * `sort_order` — the selector shows only its first few until you ask for the
 * rest, so the front of this list is the part that has to be right. Ties keep
 * `sort_order`, which is also the whole order on a fresh install where nothing
 * has been used yet.
 */
export async function loadAddOptions(
  db: SQLiteDatabase,
  at: number = Date.now(),
): Promise<AddOptions> {
  const since = at - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const [categories, accounts, uses] = await Promise.all([
    listCategories(db),
    listAccounts(db),
    db.getAllAsync<{ category_id: string; n: number }>(
      `SELECT category_id, COUNT(*) AS n FROM transactions
        WHERE deleted_at IS NULL AND category_id IS NOT NULL AND occurred_at >= ?
        GROUP BY category_id`,
      [since],
    ),
  ]);

  const used = new Map(uses.map((row) => [row.category_id, row.n]));
  // listCategories already returns sort_order, and sort is stable, so equal
  // counts — every category on day one — fall back to it untouched.
  const ranked = [...categories].sort(
    (a, b) => (used.get(b.id) ?? 0) - (used.get(a.id) ?? 0),
  );

  return {
    categories: ranked.map((c) => ({ id: c.id, name: c.name })),
    defaultAccountId: accounts[0]?.id ?? null,
  };
}
