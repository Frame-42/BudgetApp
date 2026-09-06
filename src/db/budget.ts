import type { SQLiteDatabase } from 'expo-sqlite';
import { effectiveLimits, setBudget } from '../repo/budgets';
import { monthKey } from '../time';

export type BudgetInput = {
  monthlyBudgetCents: number;
  /** Every category the editor showed, 0 where its field was left blank. */
  categoryLimitsCents: Record<string, number>;
};

/**
 * Writes the whole budget in one go. Here rather than in `repo/` for the reason
 * `onboarding.ts` is: repos are typed CRUD for one row at a time, and this is a
 * script across a month's worth of them that either lands or doesn't.
 *
 * The current month only. Limits carry forward — `monthlyBudgetCents` and
 * `effectiveLimits` both take the most recent row at or before the month asked
 * for — so one month's rows cover every month after it, while March keeps the
 * budget March was actually kept to.
 */
export async function saveMonthBudget(db: SQLiteDatabase, input: BudgetInput): Promise<void> {
  const month = monthKey(Date.now());
  /*
   * Which categories currently have a limit in force, carried forward ones
   * included. This is what makes clearing a field work: writing nothing for a
   * blank would leave an earlier month's row still applying, so a cleared limit
   * has to be written as an explicit 0 for *this* month to override it.
   *
   * A 0 row is a real state, not a missing one — `queries/home.ts` gates on
   * `limitCents > 0`, so it renders as "no limit" exactly as a category that
   * never had one does. Only categories with nothing to override are skipped,
   * which is what keeps the table from growing a zero row per category per month.
   */
  const inForce = await effectiveLimits(db, month);

  await db.withTransactionAsync(async () => {
    await setBudget(db, {
      month,
      category_id: null,
      limit_cents: input.monthlyBudgetCents,
    });

    for (const [categoryId, limitCents] of Object.entries(input.categoryLimitsCents)) {
      if (limitCents <= 0 && !inForce.has(categoryId)) continue;
      await setBudget(db, { month, category_id: categoryId, limit_cents: Math.max(0, limitCents) });
    }
  });
}
