import type { SQLiteDatabase } from 'expo-sqlite';
import { balancesByAccount, listAccounts } from '../repo/accounts';
import { listCategories } from '../repo/categories';
import { listSettings } from '../repo/settings';
import { monthlyBudgetCents } from '../repo/budgets';
import { monthKey, startOfMonth } from '../time';

export type YouData = {
  name: string;
  memberSince: string;
  netWorthCents: number;
  monthDeltaCents: number;
  accounts: { id: string; name: string; balanceCents: number }[];
  settings: { name: string; value: string }[];
};

/** The You screen: derived balances, and settings as stored rows. */
export async function loadYou(db: SQLiteDatabase, at: number = Date.now()): Promise<YouData> {
  const [accounts, balances, categories, settings] = await Promise.all([
    listAccounts(db),
    balancesByAccount(db),
    listCategories(db),
    listSettings(db),
  ]);
  const byKey = new Map(settings.map((s) => [s.key, s.value]));

  const netWorthCents = accounts.reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0);

  const movement = await db.getFirstAsync<{ total: number }>(
    `SELECT IFNULL(SUM(amount_cents), 0) AS total FROM transactions
      WHERE deleted_at IS NULL AND occurred_at >= ?`,
    [startOfMonth(at)],
  );

  const budget = await monthlyBudgetCents(db, monthKey(at));

  return {
    name: byKey.get('display_name') ?? 'You',
    memberSince: `MEMBER SINCE ${byKey.get('member_since') ?? new Date(at).getFullYear()}`,
    netWorthCents,
    monthDeltaCents: movement?.total ?? 0,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      balanceCents: balances.get(a.id) ?? 0,
    })),
    settings: [
      { name: 'Monthly budget', value: budget ? `${Math.round(budget / 100).toLocaleString('en-US')} €` : '—' },
      { name: 'Categories', value: String(categories.length) },
      { name: 'Weekly recap', value: byKey.get('weekly_recap') ?? 'SUN' },
      { name: 'Appearance', value: byKey.get('appearance') ?? 'DARK' },
    ],
  };
}
