import type { SQLiteDatabase } from 'expo-sqlite';
import { createAccount } from '../repo/accounts';
import { createCategory } from '../repo/categories';
import { updateRow } from '../repo/crud';
import { putSetting } from '../repo/settings';

/**
 * What a brand-new install starts with: the categories to spend against, and the
 * one account everything lands in. Onboarding supplies the rest — name, monthly
 * budget, opening balance — so nothing here invents a figure the user never gave.
 *
 * `demo.ts` layers months of history over this for development.
 */

/**
 * Hand-tuned rather than derived: Home's category tracks and the Trends donut
 * have to stay separable at a glance, and colour is reserved for status, so
 * category identity is carried entirely by this alpha ladder.
 *
 * The three steps added for Shopping, Investment and Health (0.8, 0.56, 0.38)
 * were slotted into the ladder's widest gaps rather than appended below 0.16,
 * where the existing steps are already a hair apart — so no category that
 * shipped before changed shade.
 */
export const CATEGORY_ALPHAS = [0.95, 0.8, 0.66, 0.56, 0.46, 0.38, 0.3, 0.22, 0.18, 0.16] as const;

/**
 * sort_order is the display order: Home shows the first three, and the Add
 * screen offers them as chips in this order.
 *
 * Ordered by how often a person is likely to *type one in*, which is not the
 * same as how much it costs: Housing and Investment are large but usually a
 * single standing payment a month, so they sit low, while Groceries is the
 * thumb's first stop. Brightness runs on its own scale — how big the category
 * usually is — which is why the alphas here look shuffled.
 */
export const DEFAULT_CATEGORIES: { name: string; alpha: number }[] = [
  { name: 'Groceries', alpha: 0.46 },
  { name: 'Dining', alpha: 0.66 },
  { name: 'Transport', alpha: 0.3 },
  { name: 'Shopping', alpha: 0.56 },
  { name: 'Leisure', alpha: 0.22 },
  { name: 'Health', alpha: 0.38 },
  { name: 'Subscription', alpha: 0.18 },
  { name: 'Housing', alpha: 0.95 },
  { name: 'Investment', alpha: 0.8 },
  // Stays last: it is the catch-all, and reads as the end of the list.
  { name: 'Other', alpha: 0.16 },
];

/** Runs once, on an empty database. */
export async function seedIfEmpty(db: SQLiteDatabase): Promise<void> {
  // The account is what makes this guard work. A categories-only seed would
  // never trip it, and would plant seven more categories on every open.
  const existing = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM accounts');
  if ((existing?.n ?? 0) > 0) return;

  await db.withTransactionAsync(async () => {
    await createAccount(db, {
      name: 'Checking',
      kind: 'checking',
      // Onboarding sets the real one; a balance nobody entered would be a lie.
      opening_balance_cents: 0,
      sort_order: 0,
    });

    for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
      await createCategory(db, {
        name: category.name,
        color_alpha: category.alpha,
        sort_order: index,
      });
    }

    // Preferences the app reads but onboarding never asks about.
    await putSetting(db, 'weekly_recap', 'SUN');
    await putSetting(db, 'appearance', 'DARK');
    await putSetting(db, 'currency', 'EUR');
  });
}

/**
 * Defaults added after an install already exists. `seedIfEmpty` is guarded on the
 * accounts count, so it never runs a second time to deliver them — without this,
 * a new default category would only ever reach a fresh install.
 *
 * Matched by name against *every* categories row, archived and soft-deleted
 * included: a category the user turned off during onboarding, or removed later,
 * has to stay gone. Checking only live rows would resurrect it on the next open.
 *
 * Appends rather than renumbering, so these land after whatever order the user
 * already has — including after 'Other' on a database that predates them.
 */
export async function addMissingDefaultCategories(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{ name: string }>('SELECT name FROM categories');
  const known = new Set(rows.map((row) => row.name));
  const missing = DEFAULT_CATEGORIES.filter((category) => !known.has(category.name));
  if (missing.length === 0) return;

  const last = await db.getFirstAsync<{ n: number | null }>(
    'SELECT MAX(sort_order) AS n FROM categories',
  );
  let order = (last?.n ?? -1) + 1;

  await db.withTransactionAsync(async () => {
    for (const category of missing) {
      await createCategory(db, {
        name: category.name,
        color_alpha: category.alpha,
        sort_order: order++,
      });
    }
  });
}

/**
 * Puts an existing database's default categories into `DEFAULT_CATEGORIES` order.
 * `addMissingDefaultCategories` appends, so a database that predates a new
 * default ends up with it stranded after 'Other'.
 *
 * One-shot, gated by the caller on a `sync_meta` key rather than run on every
 * open: every row it touches stamps `updated_at` and queues an outbox entry, and
 * re-imposing this order on each launch would also overwrite any ordering the
 * user arranges once there is a UI for it. Categories the user added themselves
 * are left where they are, after the defaults.
 */
export async function alignDefaultCategoryOrder(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{ id: string; name: string; sort_order: number }>(
    'SELECT id, name, sort_order FROM categories',
  );
  const rank = new Map(DEFAULT_CATEGORIES.map((category, index) => [category.name, index]));

  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const wanted = rank.get(row.name);
      if (wanted === undefined || wanted === row.sort_order) continue;
      await updateRow(db, 'categories', row.id, { sort_order: wanted });
    }
  });
}
