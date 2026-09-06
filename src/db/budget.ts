import type { SQLiteDatabase } from 'expo-sqlite';
import { clearFutureBudgets, effectiveLimits, monthlyBudgetCents, setBudget } from '../repo/budgets';
import { addMonths, monthKey } from '../time';

/**
 * How far an edit reaches. `recurring` is the standing budget — it applies from
 * this month on, which is simply what a row does. `month` is a one-off: this
 * month changes and the month after it goes back to what it was already going
 * to be.
 */
export type BudgetScope = 'recurring' | 'month';

export type BudgetInput = {
  monthlyBudgetCents: number;
  /** Every category the editor showed, 0 where its field was left blank. */
  categoryLimitsCents: Record<string, number>;
  scope: BudgetScope;
};

/**
 * Writes the whole budget in one go. Here rather than in `repo/` for the reason
 * `onboarding.ts` is: repos are typed CRUD for one row at a time, and this is a
 * script across a month's worth of them that either lands or doesn't.
 *
 * Never a past month. Limits carry forward — `monthlyBudgetCents` and
 * `effectiveLimits` both take the most recent row at or before the month asked
 * for — so this month's rows cover every month after it, while March keeps the
 * budget March was actually kept to.
 *
 * A `month`-scoped save is that same write plus a *pin*: a row on the following
 * month holding the figure that was already in force there, which stops this
 * month's rows carrying any further. Both scopes clear anything beyond this
 * month first, so an earlier one-off's pins can't outlive the edit that replaced
 * them.
 */
export async function saveMonthBudget(db: SQLiteDatabase, input: BudgetInput): Promise<void> {
  const month = monthKey(Date.now());
  const next = monthKey(addMonths(Date.now(), 1));

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

  /*
   * What next month holds *before* this edit, which is what a one-off has to put
   * back. Read against `next` rather than against last month deliberately: a
   * recurring save earlier today is already the standing budget, and reading
   * backwards would revert past it. An existing pin answers for itself.
   */
  const pin =
    input.scope === 'month'
      ? {
          budgetCents: await monthlyBudgetCents(db, next),
          limits: await effectiveLimits(db, next),
        }
      : null;

  await db.withTransactionAsync(async () => {
    // Read above, cleared here: the pins being replaced are part of the answer.
    await clearFutureBudgets(db, month);

    await setBudget(db, {
      month,
      category_id: null,
      limit_cents: input.monthlyBudgetCents,
    });

    for (const [categoryId, limitCents] of Object.entries(input.categoryLimitsCents)) {
      if (limitCents <= 0 && !inForce.has(categoryId)) continue;
      await setBudget(db, { month, category_id: categoryId, limit_cents: Math.max(0, limitCents) });
    }

    if (!pin) return;

    /*
     * Only where the figure actually moved. A pin equal to this month's own row
     * would say nothing that carrying forward doesn't already say, and every one
     * written is a row the table keeps for good.
     *
     * `budgetCents` is null only before onboarding has ever set a budget, which
     * this editor is unreachable without — there is nothing to restore, so the
     * one-off simply stands.
     */
    if (pin.budgetCents !== null && pin.budgetCents !== input.monthlyBudgetCents) {
      await setBudget(db, { month: next, category_id: null, limit_cents: pin.budgetCents });
    }

    for (const [categoryId, limitCents] of Object.entries(input.categoryLimitsCents)) {
      // Absent from the pin means no limit was in force, and a 0 row is how that
      // is said for a month whose predecessor now carries one.
      const before = pin.limits.get(categoryId) ?? 0;
      if (before === Math.max(0, limitCents)) continue;
      await setBudget(db, { month: next, category_id: categoryId, limit_cents: before });
    }
  });
}
