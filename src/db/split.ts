import type { SQLiteDatabase } from 'expo-sqlite';
import type { TransactionRow } from './types';
import { newId } from './ids';
import {
  createTransaction,
  deleteTransaction,
  editTransaction,
  getTransaction,
  listSplitParts,
  type NewTransaction,
} from '../repo/transactions';
import { addMonthsKeepingDay } from '../time';

/**
 * How far a transaction may be spread. Two years covers the things people
 * actually pre-pay — insurance, a season ticket, a deposit — and stops the
 * stepper from being a scroll.
 */
export const MAX_SPLIT_MONTHS = 24;

/** What the edit sheet sends: a magnitude, its direction, and its reach. */
export type SplitEdit = {
  /** The part the user held, which is the row the edit is anchored to. */
  id: string;
  /** Its group, when it already had one; null turns a plain row into a split. */
  splitId: string | null;
  /** Unsigned — `income` decides the direction, as everywhere else in the app. */
  amountCents: number;
  income: boolean;
  /** 1 is not a split; anything more spreads the amount from the original month on. */
  months: number;
  categoryId: string | null;
  merchant: string;
};

/** Which rows a delete has to reach: a part never goes without its siblings. */
export type SplitTarget = { id: string; splitId: string | null };

export const clampMonths = (months: number): number =>
  Math.min(MAX_SPLIT_MONTHS, Math.max(1, Math.round(months)));

/**
 * The total, divided as evenly as integer cents allow. 1000 over 3 is 3.34 +
 * 3.33 + 3.33, never 3.33 × 3 with a cent quietly lost — the parts always sum
 * back to the figure the user typed, which is the whole promise of a split.
 *
 * The remainder lands on the earliest parts because the first month is the one
 * the money actually left the account in.
 */
export function splitAmounts(totalCents: number, months: number): number[] {
  const count = clampMonths(months);
  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);
  const base = Math.floor(abs / count);
  const remainder = abs - base * count;
  return Array.from({ length: count }, (_, i) => sign * (base + (i < remainder ? 1 : 0)));
}

/**
 * A new transaction, spread over `months` from its own date on — what the Add
 * screen writes, and what each occurrence of a recurring schedule books.
 * `amount_cents` is the signed total; the parts follow every rule the edit path
 * below does (remainder to the earliest parts, day of the month kept).
 *
 * Opens no transaction of its own: `db/recurring.ts` books an occurrence and
 * advances its schedule as one write, and expo-sqlite's transactions don't nest.
 * Callers wrap it.
 */
export async function insertSplit(
  db: SQLiteDatabase,
  { months: requested, ...entry }: NewTransaction & { months: number },
): Promise<void> {
  const months = clampMonths(requested);
  const amounts = splitAmounts(entry.amount_cents, months);
  const splitId = months > 1 ? newId() : null;
  for (let i = 0; i < months; i++) {
    await createTransaction(db, {
      ...entry,
      amount_cents: amounts[i],
      occurred_at: addMonthsKeepingDay(entry.occurred_at, i),
      split_id: splitId,
      split_index: splitId ? i : null,
    });
  }
}

/**
 * Writes an edit to a transaction that may be — or may become, or may stop
 * being — a split.
 *
 * A split is N ordinary transaction rows sharing a `split_id`, one per month
 * from the original date on. Materialised rather than derived so that Home,
 * Trends, Spend and the export need to know nothing about splits: each part is
 * simply spending in its own month. See migration v3.
 *
 * Existing parts are reused in place rather than deleted and re-inserted, so
 * changing 12 months to 6 rewrites six rows and retires six instead of churning
 * twelve fresh ids through the outbox. Only the surplus is soft-deleted, and
 * only the shortfall is created.
 *
 * Here rather than in `repo/` for the reason `budget.ts` is: repos are typed
 * CRUD for one row, and this is a script across a group of them that either
 * lands whole or not at all.
 */
export async function saveTransactionSplit(db: SQLiteDatabase, edit: SplitEdit): Promise<void> {
  if (edit.amountCents <= 0) return;

  const held = await getTransaction(db, edit.id);
  if (!held) return;

  /* The parts as they stand, oldest first. `held` leads when there is no group
     yet, and is already inside `parts` when there is. */
  const parts: TransactionRow[] = edit.splitId ? await listSplitParts(db, edit.splitId) : [held];
  const first = parts[0] ?? held;

  const months = clampMonths(edit.months);
  const totalCents = edit.income ? edit.amountCents : -edit.amountCents;
  const amounts = splitAmounts(totalCents, months);

  /* Splitting a plain row mints the group; collapsing one back to a single
     month drops it, so the row stops looking like a group of one. */
  const splitId = months > 1 ? (edit.splitId ?? newId()) : null;

  /* The first part keeps the date the money actually moved; every later part is
     the same day of a later month. */
  const anchor = first.occurred_at;

  await db.withTransactionAsync(async () => {
    for (let i = 0; i < months; i++) {
      const values = {
        category_id: edit.categoryId,
        merchant: edit.merchant,
        amount_cents: amounts[i],
        occurred_at: addMonthsKeepingDay(anchor, i),
        split_id: splitId,
        split_index: splitId ? i : null,
      };

      const existing = parts[i];
      if (existing) {
        await editTransaction(db, existing.id, values);
        continue;
      }

      /*
       * A new part inherits the account and the note, but never the bank's
       * `external_id`: that id identifies one line on one statement, and
       * copying it onto twelve rows would make a re-import skip real spending.
       * Only the row that was actually imported keeps it, which it does by
       * being reused above.
       */
      await createTransaction(db, {
        ...values,
        account_id: first.account_id,
        note: first.note,
        recurring_id: first.recurring_id,
      });
    }

    for (const surplus of parts.slice(months)) {
      await deleteTransaction(db, surplus.id);
    }
  });
}

/**
 * Deletes the whole transaction, not the part that was held. A split is one
 * purchase the user chose to spread; leaving eleven twelfths of it behind
 * because they opened the sheet on December would be a trap.
 */
export async function deleteTransactionSplit(
  db: SQLiteDatabase,
  target: SplitTarget,
): Promise<void> {
  if (!target.splitId) {
    await deleteTransaction(db, target.id);
    return;
  }
  const parts = await listSplitParts(db, target.splitId);
  await db.withTransactionAsync(async () => {
    for (const part of parts) await deleteTransaction(db, part.id);
  });
}
