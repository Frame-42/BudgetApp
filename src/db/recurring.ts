import type { SQLiteDatabase } from 'expo-sqlite';
import type { Cadence } from './types';
import { insertSplit } from './split';
import { listAccounts } from '../repo/accounts';
import { createRecurring, editRecurring, listDueRecurring } from '../repo/recurring';
import type { NewTransaction } from '../repo/transactions';
import { dueOccurrences, occurrenceAt } from '../time';

/**
 * A recurring expense is a schedule plus the occurrences it has already booked.
 *
 * Occurrences are materialised as ordinary transaction rows — the same choice
 * `db/split.ts` makes, for the same reason: Home, Trends, Spend and the export
 * then need to know nothing about schedules. Unlike a split, which is finite and
 * written whole up front, a schedule has no end, so each occurrence is booked
 * only once its date arrives. Until then the only trace of it is `next_due_at`,
 * which is what Home's "Next out" tile reads.
 *
 * Here rather than in `repo/` for the reason `split.ts` is: each step is a script
 * across two tables that has to land whole or not at all.
 */

/**
 * Starts a schedule and books its first occurrence, dated `occurred_at` — the
 * Add screen's submit when "Repeats" is set. The schedule is left pointing at
 * the second occurrence, so nothing is due again until that date.
 */
export async function startRecurring(
  db: SQLiteDatabase,
  entry: NewTransaction & { months: number; cadence: Cadence },
): Promise<void> {
  const { months, cadence, ...first } = entry;
  await db.withTransactionAsync(async () => {
    const id = await createRecurring(db, {
      label: first.merchant,
      amount_cents: first.amount_cents,
      account_id: first.account_id,
      category_id: first.category_id,
      cadence,
      split_months: months,
      anchor_at: first.occurred_at,
      next_due_at: occurrenceAt(first.occurred_at, cadence, 1),
    });
    await insertSplit(db, { ...first, months, recurring_id: id });
  });
}

/* One pass at a time. Launch and a return to the foreground can both ask
   within a few milliseconds, and two passes reading the same due row would
   book its occurrence twice. */
let running: Promise<number> | null = null;

/**
 * Books every occurrence that has come due by `at` and advances each schedule
 * past them. Rolls forward on its own rather than waiting for a "mark as paid":
 * a standing order leaves the account whether or not anyone opens the app, and
 * a budget that only learns about rent when asked to is reading last month.
 *
 * Idempotent — a second call finds nothing due. Resolves with how many
 * occurrences it booked.
 *
 * On one device the lock above is enough. Two devices syncing would each book
 * the same occurrence; the pair (`recurring_id`, `occurred_at`) identifies it,
 * which is what a sync engine would dedupe on.
 */
export function bookDueRecurring(db: SQLiteDatabase, at: number = Date.now()): Promise<number> {
  running ??= book(db, at).finally(() => {
    running = null;
  });
  return running;
}

async function book(db: SQLiteDatabase, at: number): Promise<number> {
  const due = await listDueRecurring(db, at);
  if (due.length === 0) return 0;

  /* A schedule with no account of its own books to the one Add would use. */
  const fallbackAccount = (await listAccounts(db))[0]?.id ?? null;
  let booked = 0;

  await db.withTransactionAsync(async () => {
    for (const schedule of due) {
      const accountId = schedule.account_id ?? fallbackAccount;
      if (!accountId) continue;

      /* Rows from before migration V4 have no anchor; their next due date is the
         only fixed point they have, and it becomes the anchor from here on. */
      const anchor = schedule.anchor_at ?? schedule.next_due_at;
      const { due: dates, next } = dueOccurrences(anchor, schedule.cadence, schedule.next_due_at, at);

      for (const occurredAt of dates) {
        await insertSplit(db, {
          account_id: accountId,
          category_id: schedule.category_id,
          merchant: schedule.label,
          amount_cents: schedule.amount_cents,
          occurred_at: occurredAt,
          months: schedule.split_months,
          recurring_id: schedule.id,
        });
      }
      await editRecurring(db, schedule.id, { next_due_at: next, anchor_at: anchor });
      booked += dates.length;
    }
  });

  return booked;
}
