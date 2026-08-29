import type { SQLiteDatabase } from 'expo-sqlite';
import { createAccount, listAccounts } from '../repo/accounts';
import { archiveCategory, listCategories } from '../repo/categories';
import { setBudget } from '../repo/budgets';
import { putSetting } from '../repo/settings';
import { monthKey } from '../time';

export type OnboardingInput = {
  name: string;
  /** One of the design's seven labels; stored for later suggestions. */
  employment: string;
  monthlyBudgetCents: number;
  /** Seeded categories the user kept; everything else is archived. */
  keepCategoryIds: string[];
  weeklyRecap: boolean;
};

/**
 * Everything the first run writes, in one transaction. A half-onboarded database
 * — a name stored but no budget — is worse than making the user try again, so the
 * rollback boundary holds all of it. The `onboarded_at` flag is set by the caller
 * afterwards, so "flag set" always implies "data present".
 *
 * This is `seed.ts`'s shape rather than a repo's: repos are typed CRUD per table,
 * and this is a script across six of them.
 */
export async function runOnboarding(db: SQLiteDatabase, input: OnboardingInput): Promise<void> {
  const accounts = await listAccounts(db);
  const categories = await listCategories(db);
  const keep = new Set(input.keepCategoryIds);

  await db.withTransactionAsync(async () => {
    if (!accounts[0]) {
      await createAccount(db, {
        name: 'Checking',
        kind: 'checking',
        opening_balance_cents: 0,
        sort_order: 0,
      });
    }

    // Archived, never deleted. Transactions carry a foreign key into this table,
    // and Trends joins it without the archived filter so old spending keeps its
    // label even once the category is out of the chips.
    for (const category of categories) {
      if (!keep.has(category.id)) await archiveCategory(db, category.id);
    }

    // This month only: limits carry forward on their own, and back-dating would
    // hand the Trends bars a budget those months never had.
    await setBudget(db, {
      month: monthKey(Date.now()),
      category_id: null,
      limit_cents: input.monthlyBudgetCents,
    });

    // The design never asks for a balance, so Checking keeps the seed's opening
    // figure of zero. Balances are derived, so there is nothing else to store.
    await putSetting(db, 'display_name', input.name);
    await putSetting(db, 'employment', input.employment);
    await putSetting(db, 'weekly_recap', input.weeklyRecap ? 'SUN' : 'OFF');
    await putSetting(db, 'member_since', String(new Date().getFullYear()));
  });
}
