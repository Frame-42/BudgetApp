import type { SQLiteDatabase } from 'expo-sqlite';
import { createAccount } from '../repo/accounts';
import { createCategory } from '../repo/categories';
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
 * category identity is carried entirely by this alpha ladder. Onboarding indexes
 * into it for categories the user adds.
 */
export const CATEGORY_ALPHAS = [0.95, 0.66, 0.46, 0.3, 0.22, 0.18, 0.16] as const;

/**
 * sort_order is the display order: Home shows the first three, and the Add
 * screen offers them as chips in this order.
 */
export const DEFAULT_CATEGORIES: { name: string; alpha: number }[] = [
  { name: 'Dining', alpha: 0.66 },
  { name: 'Groceries', alpha: 0.46 },
  { name: 'Transport', alpha: 0.3 },
  { name: 'Leisure', alpha: 0.22 },
  { name: 'Housing', alpha: 0.95 },
  { name: 'Subscription', alpha: 0.18 },
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
