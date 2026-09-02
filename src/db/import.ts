import type { SQLiteDatabase } from 'expo-sqlite';
import { createTransaction } from '../repo/transactions';
import type { ImportPlan } from '../import/plan';

/**
 * Writes an import. Lives here rather than in `repo/` for the same reason
 * `onboarding.ts` does: repos are typed CRUD for one row at a time, and this is
 * a script that either lands as a batch or not at all.
 *
 * Every row still goes through `createTransaction`, so `insertRow` stamps the
 * sync columns and the v1 triggers feed the outbox — dozens of rows arriving at
 * once is exactly the case where a hand-rolled INSERT would quietly break sync.
 */
export async function commitImport(
  db: SQLiteDatabase,
  plan: ImportPlan,
  accountId: string,
): Promise<number> {
  const rows = plan.rows.filter((row) => !row.skip && row.categoryId !== null);
  if (rows.length === 0) return 0;

  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await createTransaction(db, {
        account_id: accountId,
        category_id: row.categoryId,
        merchant: row.merchant,
        amount_cents: row.amountCents,
        occurred_at: row.occurredAt,
        note: row.note,
        external_id: row.externalId,
      });
    }
  });

  return rows.length;
}
