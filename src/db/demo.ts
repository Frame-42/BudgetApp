import type { SQLiteDatabase } from 'expo-sqlite';
import { addMonths, daysInMonth, monthKey, startOfDay } from '../time';
import { createAccount, listAccounts, setOpeningBalance } from '../repo/accounts';
import { archiveCategory, createCategory, listCategories } from '../repo/categories';
import { createTransaction, type NewTransaction } from '../repo/transactions';
import { setBudget } from '../repo/budgets';
import { createRecurring, deleteRecurring } from '../repo/recurring';
import { putSetting } from '../repo/settings';
import { saveMonthBudget } from './budget';
import { bookDueRecurring } from './recurring';
import { insertSplit } from './split';

/**
 * The test bench: development-only sample data, layered on top of what
 * `seedIfEmpty` created. Every rule in AGENTS.md that can only be judged against
 * real rows has a case here, so one tap of "Load sample data" puts each feature
 * on screen. The cases, and where to look for each, are listed in AGENTS.md
 * under "The test bench"; change the two together.
 *
 * Everything is placed relative to the day it is loaded, so the bench never
 * goes stale. It reads best mid-month: loaded on the 2nd, a month's spending is
 * squeezed into a day or two.
 *
 * Everything below is in integer cents.
 */

/** Recorded months, oldest first: the discretionary spending each adds up to. */
const HISTORY = [128_000, 141_000, 118_000, 152_000, 125_000, 133_000, 162_000, 121_000, 139_000, 127_000];
/**
 * Months back the history reaches. The month before it is left empty on
 * purpose — it is when "tracking began" — so Trends' 1Y span shows a month with
 * nothing recorded as grey and unpickable, rather than as a month of zero.
 */
const MONTHS_OF_HISTORY = HISTORY.length;

const SALARY_CENTS = 420_000;
const RENT_CENTS = 145_000;

type DemoCategory = {
  name: string;
  /** Share of a past month's discretionary spending. */
  weight: number;
  /** Rows per past month. */
  perMonth: number;
  /** This month's discretionary spending, before the fixed rows below. */
  currentCents: number;
  merchants: string[];
};

/**
 * Keyed by the names `seedIfEmpty` creates. Investment has no discretionary
 * rows: its money arrives as imported savings-plan buys.
 *
 * Merchants are chosen against the sample bank file (`devtools/sampleBankExport.ts`):
 * Coop, Migros and Amazon must be in the merchant memory there, and Galaxus,
 * Shell, dm, Post and Opernhaus must not.
 */
const CATEGORIES: DemoCategory[] = [
  { name: 'Groceries', weight: 0.32, perMonth: 10, currentCents: 31_000, merchants: ['Migros', 'Coop', 'Alnatura', 'Denner'] },
  { name: 'Dining', weight: 0.22, perMonth: 9, currentCents: 24_500, merchants: ['Blue Bottle', 'Kafi Dihei', 'Sushi Bar', 'Hiltl', 'Nooch'] },
  // Over its limit this month: Home draws the over-limit tip.
  { name: 'Transport', weight: 0.09, perMonth: 6, currentCents: 16_800, merchants: ['SBB Ticket', 'ZVV Pass', 'Taxi'] },
  // No limit: Home shows the bare figure.
  { name: 'Shopping', weight: 0.14, perMonth: 4, currentCents: 9_000, merchants: ['Zalando', 'Manor', 'Interdiscount', 'Amazon'] },
  { name: 'Leisure', weight: 0.08, perMonth: 4, currentCents: 6_000, merchants: ['Kino Riffraff', 'Bouldering Gym', 'Museum'] },
  // Its limit is cleared three months back, with an explicit zero row.
  { name: 'Health', weight: 0.04, perMonth: 2, currentCents: 4_500, merchants: ['Physio Zentrum', 'Dentist', 'Pharmacy'] },
  { name: 'Subscription', weight: 0.03, perMonth: 2, currentCents: 2_400, merchants: ['Netflix', 'iCloud', 'NZZ'] },
  { name: 'Housing', weight: 0.05, perMonth: 2, currentCents: 9_500, merchants: ['Electricity', 'Internet'] },
  { name: 'Misc', weight: 0.03, perMonth: 2, currentCents: 3_500, merchants: ['Bookshop', 'Gift', 'Hardware Store'] },
];

/** Limits from the first recorded month. Shopping and Investment never get one. */
const LIMITS: Record<string, number> = {
  Groceries: 45_000,
  Dining: 30_000,
  Transport: 15_000,
  Leisure: 25_000,
  Health: 8_000,
  Subscription: 8_000,
  Housing: 170_000,
  Misc: 10_000,
};
const BUDGET_START = 290_000;
/** Six months back the budget rises and Subscription's limit with it: Trends' bars show the step. */
const BUDGET_RAISED = 310_000;
const SUBSCRIPTION_RAISED = 10_000;
/** This month only, through the editor's own "This month only" path: next month is pinned back. */
const BUDGET_THIS_MONTH_ONLY = 340_000;

/**
 * Typed in by hand today and yesterday. Blue Bottle is the sample bank file's
 * fuzzy duplicate: the file carries the same 6.40 € a little later the same day.
 */
const RECENT = [
  { day: 0, category: 'Dining', merchant: 'Blue Bottle', cents: -640 },
  { day: 0, category: 'Groceries', merchant: 'Migros', cents: -3_810 },
  { day: 0, category: 'Transport', merchant: 'SBB Ticket', cents: -1_280 },
  { day: -1, category: 'Leisure', merchant: 'Kino Riffraff', cents: -2_100 },
  { day: -1, category: 'Subscription', merchant: 'Netflix', cents: -1_890 },
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

/**
 * Populates a freshly seeded database with the bench. Assumes `seedIfEmpty` has
 * already run, so it looks the account and categories up by name rather than
 * creating them. Writes through the app's own scripts wherever one exists —
 * `insertSplit`, `bookDueRecurring`, `saveMonthBudget` — so the bench's rows are
 * shaped exactly as the app shapes them.
 */
export async function loadDemoData(db: SQLiteDatabase): Promise<void> {
  const rand = lcg(20_260_827);
  const now = Date.now();
  const today = new Date(now);
  const dayOfMonth = today.getDate();

  /** A moment `back` months ago (0 is this month), its day clamped to the month. */
  const at = (back: number, day: number, hour = 9 + Math.floor(rand() * 10), minute = Math.floor(rand() * 60)) => {
    const base = new Date(addMonths(now, -back));
    return new Date(base.getFullYear(), base.getMonth(), Math.min(day, daysInMonth(base)), hour, minute).getTime();
  };
  /** Never in the future: a bench row dated after now would read as planned. */
  const notAfterNow = (ts: number) => Math.min(ts, now - 60_000);

  const accounts = await listAccounts(db);
  const checking = accounts[0]?.id;
  if (!checking) return;

  const categories = await listCategories(db);
  const categoryIds = new Map(categories.map((c) => [c.name, c.id]));
  const cat = (name: string | null) => (name ? (categoryIds.get(name) ?? null) : null);

  const spend = (when: number, category: string | null, merchant: string, cents: number, extra: Partial<NewTransaction> = {}) =>
    createTransaction(db, {
      account_id: checking,
      category_id: cat(category),
      merchant,
      amount_cents: cents,
      occurred_at: when,
      ...extra,
    });

  let gymId = '';

  await db.withTransactionAsync(async () => {
    // --- accounts --------------------------------------------------------------
    // The seed ships one account; net worth needs more than one to add up.
    await createAccount(db, { name: 'Savings', kind: 'savings', opening_balance_cents: 2_590_000, sort_order: 1 });
    const credit = await createAccount(db, {
      name: 'Credit card',
      kind: 'credit',
      opening_balance_cents: -63_000,
      sort_order: 2,
    });

    // --- budget history ----------------------------------------------------------
    // Set against the first recorded month and carried forward from there; the
    // two later rows show a raise and a cleared limit (an explicit 0, not a gap).
    const firstMonth = monthKey(addMonths(now, -MONTHS_OF_HISTORY));
    await setBudget(db, { month: firstMonth, category_id: null, limit_cents: BUDGET_START });
    for (const [name, cents] of Object.entries(LIMITS)) {
      const id = cat(name);
      if (id) await setBudget(db, { month: firstMonth, category_id: id, limit_cents: cents });
    }
    const raised = monthKey(addMonths(now, -6));
    await setBudget(db, { month: raised, category_id: null, limit_cents: BUDGET_RAISED });
    const subscription = cat('Subscription');
    if (subscription) await setBudget(db, { month: raised, category_id: subscription, limit_cents: SUBSCRIPTION_RAISED });
    const health = cat('Health');
    if (health) await setBudget(db, { month: monthKey(addMonths(now, -3)), category_id: health, limit_cents: 0 });

    // --- an archived category with history -----------------------------------
    // Gone from the chips and the budget list, still labelled in Trends' donut.
    const travel = await createCategory(db, { name: 'Travel', color_alpha: 0.26, sort_order: categories.length });
    await createTransaction(db, { account_id: checking, category_id: travel, merchant: 'TAP Air Portugal', amount_cents: -42_000, occurred_at: at(8, 6) });
    await createTransaction(db, { account_id: checking, category_id: travel, merchant: 'Hotel Alfama', amount_cents: -38_000, occurred_at: at(8, 14) });
    await createTransaction(db, { account_id: checking, category_id: travel, merchant: 'Trenitalia', amount_cents: -8_900, occurred_at: at(7, 22) });
    await archiveCategory(db, travel);

    // --- recorded months ---------------------------------------------------------
    for (let back = MONTHS_OF_HISTORY; back >= 1; back--) {
      const discretionary = HISTORY[MONTHS_OF_HISTORY - back];
      const lastDay = daysInMonth(addMonths(now, -back));

      await spend(at(back, 25), null, 'Salary', SALARY_CENTS);
      // Uncategorised money out: in Home's spent, in no category row.
      await spend(at(back, 12), null, 'ATM withdrawal', -10_000);

      for (const category of CATEGORIES) {
        for (const cents of split(rand, Math.round(discretionary * category.weight), category.perMonth)) {
          const merchant = category.merchants[Math.floor(rand() * category.merchants.length)];
          await spend(at(back, 1 + Math.floor(rand() * lastDay)), category.name, merchant, -cents);
        }
      }
    }

    // --- imported rows -----------------------------------------------------------
    // Carry the bank's id, which is what the sample bank file repeats to show
    // "already imported". The savings plan is the only Investment spending.
    for (let back = 6; back >= 0; back--) {
      const when = at(back, 2, 7, 30);
      if (when > now) continue;
      await spend(when, 'Investment', 'Vanguard FTSE All-World', -20_000, { external_id: `tb-buy-${monthKey(when)}` });
    }
    // Foreign charges keep what they were in the note, as the importer writes them.
    await spend(at(2, 9), 'Dining', 'Pret A Manger', -910, { note: '7.60 GBP', external_id: 'tb-card-pret' });
    await spend(at(1, 16), 'Groceries', 'Migros', -5_020, { note: '48.20 CHF', external_id: 'tb-card-migros' });
    // The last import, ten days ago: the sample bank file reaches both sides of
    // it, so the import sheet offers "just what's new".
    await spend(notAfterNow(startOfDay(now - 10 * 86_400_000) + 17 * 3_600_000), 'Groceries', 'Coop', -6_240, {
      external_id: 'tb-card-coop',
    });

    // --- on the credit card --------------------------------------------------------
    await createTransaction(db, { account_id: credit, category_id: cat('Shopping'), merchant: 'Interdiscount', amount_cents: -18_900, occurred_at: at(1, 21) });

    // --- splits --------------------------------------------------------------------
    // Spread across now: one part per month, later parts on the 1st. This
    // month's part is spent, the next is next month's planned money.
    await insertSplit(db, { account_id: checking, category_id: cat('Shopping'), merchant: 'MacBook Air', amount_cents: -149_900, occurred_at: at(2, 18, 15, 10), months: 6 });
    // Fully elapsed.
    await insertSplit(db, { account_id: checking, category_id: cat('Shopping'), merchant: 'Winter jacket', amount_cents: -24_000, occurred_at: at(9, 12), months: 3 });
    // Bought this month, and a total that doesn't divide: 33.34 + 33.33 + 33.33.
    await insertSplit(db, {
      account_id: checking,
      category_id: cat('Leisure'),
      merchant: 'Concert tickets',
      amount_cents: -10_000,
      occurred_at: notAfterNow(at(0, Math.max(1, dayOfMonth - 4), 10, 15)),
      months: 3,
    });

    // --- schedules -----------------------------------------------------------------
    // Created back-dated and booked by `bookDueRecurring` below, the way a
    // back-dated schedule from Add books its missed occurrences.
    // Rent is due late in the month: until the 27th it is this month's planned money.
    await createRecurring(db, { label: 'Rent', amount_cents: -RENT_CENTS, next_due_at: at(MONTHS_OF_HISTORY, 27, 8, 0), account_id: checking, category_id: cat('Housing') });
    await createRecurring(db, { label: 'Spotify', amount_cents: -1_199, next_due_at: at(MONTHS_OF_HISTORY, 3, 6, 0), account_id: checking, category_id: cat('Subscription') });
    // Yearly and spread over twelve months: a schedule whose occurrence is a split.
    await createRecurring(db, {
      label: 'Household insurance',
      amount_cents: -48_000,
      next_due_at: at(5, 10, 8, 0),
      account_id: checking,
      category_id: cat('Housing'),
      cadence: 'year',
      split_months: 12,
    });
    // Weekly, last booked two days ago: its next class is this week's planned money.
    await createRecurring(db, {
      label: 'Yoga class',
      amount_cents: -2_500,
      next_due_at: startOfDay(now - (2 + 7 * 8) * 86_400_000) + 18 * 3_600_000,
      account_id: checking,
      category_id: cat('Leisure'),
      cadence: 'week',
    });
    // Stopped four months ago (below): its booked rows stay, with no "Stop repeating".
    gymId = await createRecurring(db, { label: 'Old gym', amount_cents: -4_900, next_due_at: at(MONTHS_OF_HISTORY, 5, 7, 0), account_id: checking, category_id: cat('Leisure') });

    // --- this month ----------------------------------------------------------------
    const fixedByCategory = new Map<string, number>();
    for (const item of RECENT) {
      const when = notAfterNow(startOfDay(now + item.day * 86_400_000) + 11 * 3_600_000);
      if (new Date(when).getMonth() === today.getMonth()) {
        fixedByCategory.set(item.category, (fixedByCategory.get(item.category) ?? 0) - item.cents);
      }
      await spend(when, item.category, item.merchant, item.cents);
    }
    if (dayOfMonth >= 25) await spend(notAfterNow(at(0, 25, 8, 0)), null, 'Salary', SALARY_CENTS);
    if (dayOfMonth > 12) await spend(at(0, 12, 12, 0), null, 'ATM withdrawal', -10_000);

    for (const category of CATEGORIES) {
      const remaining = category.currentCents - (fixedByCategory.get(category.name) ?? 0);
      if (remaining <= 0) continue;
      // Leave the last two days to the hand-typed rows above.
      const range = Math.max(1, dayOfMonth - 2);
      for (const cents of split(rand, remaining, Math.max(1, Math.round(category.perMonth * 0.6)))) {
        const merchant = category.merchants[Math.floor(rand() * category.merchants.length)];
        await spend(notAfterNow(at(0, 1 + Math.floor(rand() * range))), category.name, merchant, -cents);
      }
    }

    await putSetting(db, 'display_name', 'Lena Brunner');
    await putSetting(db, 'employment', 'Employed');
    await putSetting(db, 'member_since', String(new Date(addMonths(now, -MONTHS_OF_HISTORY)).getFullYear()));
  });

  // Each of these opens its own transaction, and expo-sqlite's don't nest.
  // Book the gym up to four months ago, stop it, then roll everything to today.
  await bookDueRecurring(db, at(4, 15, 12, 0));
  await deleteRecurring(db, gymId);
  await bookDueRecurring(db, now);

  // This month's budget raised through the editor's "This month only" path, so
  // next month carries a pin back to the standing 3,100 €.
  const limits: Record<string, number> = {};
  for (const [name, cents] of Object.entries(LIMITS)) {
    const id = cat(name);
    if (!id || name === 'Health') continue;
    limits[id] = name === 'Subscription' ? SUBSCRIPTION_RAISED : cents;
  }
  await saveMonthBudget(db, { monthlyBudgetCents: BUDGET_THIS_MONTH_ONLY, categoryLimitsCents: limits, scope: 'month' });

  // Choose the opening balance that lands checking on its intended balance,
  // rather than storing a balance that would then have to be maintained. Every
  // row whatever its date, as `balancesByAccount` sums them: a split's later
  // parts left the account with the purchase.
  const moved = await db.getFirstAsync<{ total: number }>(
    'SELECT IFNULL(SUM(amount_cents), 0) AS total FROM transactions WHERE account_id = ? AND deleted_at IS NULL',
    [checking],
  );
  await setOpeningBalance(db, checking, 314_000 - (moved?.total ?? 0));
}
