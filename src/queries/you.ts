import type { SQLiteDatabase } from 'expo-sqlite';
import { listCategories } from '../repo/categories';
import { listSettings } from '../repo/settings';
import { effectiveLimits, monthlyBudgetCents } from '../repo/budgets';
import { monthKey } from '../time';
import { parseAppearance, type Appearance } from '../theme';

/**
 * Which setting a row is, so the screen can attach an editor without matching on
 * the label. A rename of "Monthly budget" is then a copy change, not a silently
 * broken tap target.
 */
export type YouSettingKey = 'budget' | 'categories' | 'recap' | 'appearance';

export type YouData = {
  name: string;
  memberSince: string;
  /** Everything the app has ever recorded going out, as a positive figure. */
  trackedCents: number;
  trackedCount: number;
  /** The three categories the most money has gone to, largest first. */
  topCategories: { id: string; name: string; spentCents: number }[];
  settings: { key: YouSettingKey; name: string; value: string }[];
  /** The figure behind the budget row, for the editor to open on. */
  budgetCents: number | null;
  /** Cents per category id, carried-forward limits included, for the same editor. */
  categoryLimits: Record<string, number>;
  /**
   * Live categories in `sort_order`. Deliberately not `add.categories`, which
   * ranks by recent use: that is right for the Add screen's chips and wrong for
   * a budget list, where the rows should sit where Home puts them and stay put
   * between visits rather than reshuffling as spending moves.
   */
  categories: { id: string; name: string }[];
  /** Drives the whole app's palette, not just the row that shows it. */
  appearance: Appearance;
};

/**
 * The You screen: what the app knows, and settings as stored rows.
 *
 * The hero counts spending rather than net worth. Balances are derived from
 * transactions, and the importer deliberately drops incoming money, so a net
 * worth figure would drift further from the truth with every import — where
 * "what have I tracked" is exactly as true as the rows behind it.
 *
 * All of it is all-time, not this month: an import usually lands last month's
 * statement, and a month-scoped hero would show nothing at the moment it has
 * most to say.
 */
export async function loadYou(db: SQLiteDatabase, at: number = Date.now()): Promise<YouData> {
  const [categories, settings] = await Promise.all([listCategories(db), listSettings(db)]);
  const byKey = new Map(settings.map((s) => [s.key, s.value]));

  const tracked = await db.getFirstAsync<{ total: number; n: number }>(
    `SELECT IFNULL(SUM(-amount_cents), 0) AS total, COUNT(*) AS n FROM transactions
      WHERE deleted_at IS NULL AND amount_cents < 0`,
  );

  // Joined without the archived filter, as trends.ts does: a category switched
  // off later still explains the money that went through it.
  const top = await db.getAllAsync<{ id: string; name: string; total: number }>(
    `SELECT c.id, c.name, SUM(-t.amount_cents) AS total
       FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE t.deleted_at IS NULL AND t.amount_cents < 0
      GROUP BY c.id, c.name
      ORDER BY total DESC
      LIMIT 3`,
  );

  const month = monthKey(at);
  const [budget, limits] = await Promise.all([
    monthlyBudgetCents(db, month),
    effectiveLimits(db, month),
  ]);

  return {
    // `||` not `??`: an empty name is storable, and it renders a blank avatar.
    name: byKey.get('display_name') || 'You',
    memberSince: `MEMBER SINCE ${byKey.get('member_since') ?? new Date(at).getFullYear()}`,
    trackedCents: tracked?.total ?? 0,
    trackedCount: tracked?.n ?? 0,
    topCategories: top.map((row) => ({ id: row.id, name: row.name, spentCents: row.total })),
    budgetCents: budget,
    categoryLimits: Object.fromEntries(limits),
    categories: categories.map((category) => ({ id: category.id, name: category.name })),
    appearance: parseAppearance(byKey.get('appearance')),
    settings: [
      { key: 'budget', name: 'Monthly budget', value: budget ? `${Math.round(budget / 100).toLocaleString('en-US')} €` : '—' },
      { key: 'categories', name: 'Categories', value: String(categories.length) },
      { key: 'recap', name: 'Weekly recap', value: byKey.get('weekly_recap') ?? 'SUN' },
      {
        key: 'appearance',
        name: 'Appearance',
        value: { system: 'SYS', dark: 'DARK', light: 'LIGHT' }[parseAppearance(byKey.get('appearance'))],
      },
    ],
  };
}
