import type { SQLiteDatabase } from 'expo-sqlite';
import type { Cadence, RecurringRow } from '../db/types';
import { insertRow, listAlive, softDeleteRow, updateRow } from './crud';

/** Scheduled money out, e.g. rent — projected into Home's "Coming up" card. */
export const listRecurring = (db: SQLiteDatabase) =>
  listAlive<RecurringRow>(db, 'recurring', { orderBy: 'next_due_at' });

export const createRecurring = (
  db: SQLiteDatabase,
  {
    cadence = 'month',
    split_months = 1,
    ...values
  }: {
    label: string;
    amount_cents: number;
    next_due_at: number;
    account_id: string | null;
    category_id: string | null;
    cadence?: Cadence;
    /** Defaults to `next_due_at`: a schedule that starts where it is next due. */
    anchor_at?: number;
    split_months?: number;
  },
) =>
  insertRow(db, 'recurring', {
    anchor_at: values.next_due_at,
    cadence,
    split_months,
    ...values,
  });

export const editRecurring = (
  db: SQLiteDatabase,
  id: string,
  patch: Partial<Pick<RecurringRow, 'next_due_at' | 'anchor_at'>>,
) => updateRow(db, 'recurring', id, patch);

/** Stops the schedule. What it already booked stays: that money really moved. */
export const deleteRecurring = (db: SQLiteDatabase, id: string) =>
  softDeleteRow(db, 'recurring', id);

/** Schedules with an occurrence at or before `at` that hasn't been booked yet. */
export const listDueRecurring = (db: SQLiteDatabase, at: number) =>
  listAlive<RecurringRow>(db, 'recurring', {
    where: 'next_due_at <= ?',
    params: [at],
    orderBy: 'next_due_at',
  });
