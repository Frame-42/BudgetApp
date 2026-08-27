import type { SQLiteDatabase } from 'expo-sqlite';
import { addMonths, daysInMonth, monthKey, startOfDay } from '../time';
import { createAccount, setOpeningBalance } from '../repo/accounts';
import { createCategory } from '../repo/categories';
import { createTransaction } from '../repo/transactions';
import { setBudget } from '../repo/budgets';
import { createRecurring } from '../repo/recurring';
import { putSetting } from '../repo/settings';

/**
 * First-run demo data, so the screens have something true to compute from.
 * A shipping app would seed only the categories and an empty budget; this exists
 * because the design's numbers are the spec we are checking ourselves against.
 *
 * Everything below is in integer cents.
 */

const MONTHS_OF_HISTORY = 5;

/** Oldest first: what each completed month adds up to. */
const HISTORY_TOTALS = [290_000, 330_000, 260_000, 305_000, 245_000];

const SALARY_CENTS = 420_000;
const RENT_CENTS = 145_000;

type SeedCategory = {
  name: string;
  alpha: number;
  limitCents: number;
  /** Share of a past month's non-rent spending. */
  weight: number;
  /** How many transactions it gets in the current month. */
  count: number;
  currentCents: number;
  merchants: string[];
};

/**
 * sort_order is the display order the design uses: Home shows the first three,
 * the Add screen offers the first four as chips.
 */
const CATEGORIES: SeedCategory[] = [
  {
    name: 'Dining',
    alpha: 0.66,
    limitCents: 40_000,
    weight: 0.3,
    count: 14,
    currentCents: 32_000,
    merchants: ['Blue Bottle', 'Kafi Dihei', 'Sushi Bar', 'Bäckerei Fischer', 'Hiltl', 'Nooch'],
  },
  {
    name: 'Groceries',
    alpha: 0.46,
    limitCents: 35_000,
    weight: 0.26,
    count: 9,
    currentCents: 26_500,
    merchants: ['Migros', 'Coop', 'Alnatura', 'Denner'],
  },
  {
    name: 'Transport',
    alpha: 0.3,
    limitCents: 18_000,
    weight: 0.11,
    count: 8,
    currentCents: 9_600,
    merchants: ['SBB Ticket', 'ZVV Pass', 'Taxi', 'Fuel'],
  },
  {
    name: 'Leisure',
    alpha: 0.22,
    limitCents: 25_000,
    weight: 0.15,
    count: 5,
    currentCents: 30_000,
    merchants: ['Kino Riffraff', 'Bouldering Gym', 'Concert', 'Museum'],
  },
  {
    name: 'Housing',
    alpha: 0.95,
    limitCents: 150_000,
    weight: 0,
    count: 4,
    currentCents: 62_000,
    merchants: ['Electricity', 'Internet', 'Insurance', 'Heating'],
  },
  {
    name: 'Subscription',
    alpha: 0.18,
    limitCents: 8_000,
    weight: 0.06,
    count: 3,
    currentCents: 7_200,
    merchants: ['Spotify', 'iCloud', 'Netflix', 'NZZ'],
  },
  {
    name: 'Other',
    alpha: 0.16,
    limitCents: 44_000,
    weight: 0.12,
    count: 4,
    currentCents: 28_700,
    merchants: ['Pharmacy', 'Bookshop', 'Gift', 'Hardware Store'],
  },
];

/** The month's overall budget — deliberately the sum of the category limits. */
const MONTHLY_BUDGET_CENTS = CATEGORIES.reduce((sum, c) => sum + c.limitCents, 0);

/** The rows the design shows by name under Today and Yesterday. */
const RECENT = [
  { day: 0, category: 'Dining', merchant: 'Blue Bottle', cents: -640 },
  { day: 0, category: 'Groceries', merchant: 'Migros', cents: -3_810 },
  { day: 0, category: 'Transport', merchant: 'SBB Ticket', cents: -1_280 },
  { day: -1, category: 'Leisure', merchant: 'Kino Riffraff', cents: -2_100 },
  { day: -1, category: 'Subscription', merchant: 'Spotify', cents: -1_199 },
  { day: -1, category: null, merchant: 'Salary', cents: SALARY_CENTS },
];

/** Deterministic, so a reseed produces the same history twice. */
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (state * 1_664_525 + 1_013_904_223) >>> 0) / 2 ** 32);
}

/** Splits a total into `count` uneven parts that still add up exactly. */
function split(rand: () => number, total: number, count: number, min = 150): number[] {
  if (count <= 1) return [total];
  const weights = Array.from({ length: count }, () => 0.4 + rand());
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.max(min, Math.round((total * w) / sum)));
  const drift = total - parts.reduce((a, b) => a + b, 0);
  parts[parts.length - 1] = Math.max(min, parts[parts.length - 1] + drift);
  return parts;
}

const atDay = (base: Date, day: number, rand: () => number) =>
  new Date(
    base.getFullYear(),
    base.getMonth(),
    day,
    9 + Math.floor(rand() * 10),
    Math.floor(rand() * 60),
  ).getTime();

/** Runs once, on an empty database. */
export async function seedIfEmpty(db: SQLiteDatabase): Promise<void> {
  const existing = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM accounts');
  if ((existing?.n ?? 0) > 0) return;

  const rand = lcg(20_260_827);
  const today = new Date();
  const dayOfMonth = today.getDate();

  await db.withTransactionAsync(async () => {
    const checking = await createAccount(db, {
      name: 'Checking',
      kind: 'checking',
      opening_balance_cents: 0, // reconciled at the end, once the history exists
      sort_order: 0,
    });
    await createAccount(db, {
      name: 'Savings',
      kind: 'savings',
      opening_balance_cents: 2_590_000,
      sort_order: 1,
    });
    await createAccount(db, {
      name: 'Credit card',
      kind: 'credit',
      opening_balance_cents: -63_000,
      sort_order: 2,
    });

    const categoryIds = new Map<string, string>();
    for (const [index, category] of CATEGORIES.entries()) {
      categoryIds.set(
        category.name,
        await createCategory(db, {
          name: category.name,
          color_alpha: category.alpha,
          sort_order: index,
        }),
      );
    }

    // Budgets are set against the oldest month and carry forward from there.
    const firstMonth = monthKey(addMonths(today, -MONTHS_OF_HISTORY));
    await setBudget(db, { month: firstMonth, category_id: null, limit_cents: MONTHLY_BUDGET_CENTS });
    for (const category of CATEGORIES) {
      await setBudget(db, {
        month: firstMonth,
        category_id: categoryIds.get(category.name)!,
        limit_cents: category.limitCents,
      });
    }

    const spend = async (
      when: number,
      categoryName: string | null,
      merchant: string,
      cents: number,
    ) =>
      createTransaction(db, {
        account_id: checking,
        category_id: categoryName ? (categoryIds.get(categoryName) ?? null) : null,
        merchant,
        amount_cents: cents,
        occurred_at: when,
      });

    // --- completed months -----------------------------------------------------
    for (let back = MONTHS_OF_HISTORY; back >= 1; back--) {
      const base = new Date(addMonths(today, -back));
      const total = HISTORY_TOTALS[MONTHS_OF_HISTORY - back];
      const lastDay = daysInMonth(base);

      await spend(atDay(base, 1, rand), 'Housing', 'Rent', -RENT_CENTS);
      await spend(atDay(base, 25, rand), null, 'Salary', SALARY_CENTS);

      const discretionary = total - RENT_CENTS;
      for (const category of CATEGORIES) {
        if (category.weight === 0) continue;
        const count = Math.max(2, Math.round(category.count * 0.8));
        for (const cents of split(rand, Math.round(discretionary * category.weight), count)) {
          const merchant = category.merchants[Math.floor(rand() * category.merchants.length)];
          await spend(atDay(base, 1 + Math.floor(rand() * lastDay), rand), category.name, merchant, -cents);
        }
      }
    }

    // --- current month --------------------------------------------------------
    // Rent for this month is still ahead (the "Next out" tile), so it is absent.
    const fixedByCategory = new Map<string, number>();
    for (const item of RECENT) {
      const when = startOfDay(today.getTime() + item.day * 86_400_000) + 11 * 3_600_000;
      // Only count the fixed rows against this month's targets if they fall inside it.
      if (item.cents < 0 && new Date(when).getMonth() === today.getMonth() && item.category) {
        fixedByCategory.set(item.category, (fixedByCategory.get(item.category) ?? 0) - item.cents);
      }
      await spend(when, item.category, item.merchant, item.cents);
    }

    for (const category of CATEGORIES) {
      const alreadySpent = fixedByCategory.get(category.name) ?? 0;
      const remaining = category.currentCents - alreadySpent;
      const count = category.count - (alreadySpent > 0 ? 1 : 0);
      if (remaining <= 0 || count <= 0) continue;
      // Leave the last two days to the fixed rows above.
      const range = Math.max(1, dayOfMonth - 2);
      for (const cents of split(rand, remaining, count)) {
        const merchant = category.merchants[Math.floor(rand() * category.merchants.length)];
        await spend(atDay(today, 1 + Math.floor(rand() * range), rand), category.name, merchant, -cents);
      }
    }

    await createRecurring(db, {
      label: 'Rent',
      amount_cents: -RENT_CENTS,
      next_due_at: addMonths(today, 1),
      account_id: checking,
      category_id: categoryIds.get('Housing') ?? null,
    });

    await putSetting(db, 'weekly_recap', 'SUN');
    await putSetting(db, 'appearance', 'DARK');
    await putSetting(db, 'currency', 'EUR');
    await putSetting(db, 'display_name', 'Lena Brunner');
    await putSetting(db, 'member_since', '2024');

    // Choose the opening balance that lands the account on its intended balance
    // today, rather than storing a balance that would then have to be maintained.
    const moved = await db.getFirstAsync<{ total: number }>(
      'SELECT IFNULL(SUM(amount_cents), 0) AS total FROM transactions WHERE account_id = ?',
      [checking],
    );
    await setOpeningBalance(db, checking, 314_000 - (moved?.total ?? 0));
  });
}
