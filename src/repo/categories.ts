import type { SQLiteDatabase } from 'expo-sqlite';
import type { CategoryRow } from '../db/types';
import { insertRow, listAlive, softDeleteRow, updateRow } from './crud';

export const listCategories = (db: SQLiteDatabase) =>
  listAlive<CategoryRow>(db, 'categories', { where: 'archived = 0', orderBy: 'sort_order' });

export const createCategory = (
  db: SQLiteDatabase,
  values: { name: string; color_alpha: number; sort_order: number },
) => insertRow(db, 'categories', { archived: 0, ...values });

export const renameCategory = (db: SQLiteDatabase, id: string, name: string) =>
  updateRow(db, 'categories', id, { name });

export const archiveCategory = (db: SQLiteDatabase, id: string) =>
  updateRow(db, 'categories', id, { archived: 1 });

export const deleteCategory = (db: SQLiteDatabase, id: string) =>
  softDeleteRow(db, 'categories', id);
