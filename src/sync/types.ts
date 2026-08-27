import type { SyncedTable } from '../db/migrations';

/**
 * One row's worth of change, in both directions. Deliberately dumb: a table
 * name, the row, and when it changed — anything a server can express.
 */
export type Change = {
  table: SyncedTable;
  rowId: string;
  op: 'upsert' | 'delete';
  updatedAt: number;
  /** Full row for an upsert; absent for a delete. */
  row?: Record<string, unknown>;
};

export type PullResult = {
  changes: Change[];
  /** Server clock at the moment of the pull; becomes the next `since`. */
  serverTime: number;
};

export type PushResult = {
  /** Outbox sequence numbers the server accepted, safe to drop locally. */
  applied: number[];
  serverTime: number;
};

/**
 * The whole surface a backend has to implement. Supabase, a bespoke API and
 * PowerSync can all satisfy this, which is the point of writing it now: the
 * repositories and screens never learn which one you picked.
 *
 * Conflict rule for whoever implements it: last write wins on `updated_at`,
 * ties broken by `device_id`. Deletes are soft (`deleted_at`), so a deletion is
 * a fact that propagates rather than an absence that can't.
 */
export interface SyncEngine {
  readonly id: string;
  pull(since: number): Promise<PullResult>;
  push(changes: Change[]): Promise<PushResult>;
}
