import type { SQLiteDatabase } from 'expo-sqlite';
import { listAccounts } from '../repo/accounts';
import { listCategories } from '../repo/categories';

export type AddOptions = {
  categories: { id: string; name: string }[];
  defaultAccountId: string | null;
};

/** What the Add screen needs to offer: the category chips and where to book it. */
export async function loadAddOptions(db: SQLiteDatabase): Promise<AddOptions> {
  const [categories, accounts] = await Promise.all([listCategories(db), listAccounts(db)]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    defaultAccountId: accounts[0]?.id ?? null,
  };
}
