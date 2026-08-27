import type { Change, PullResult, PushResult, SyncEngine } from './types';

/**
 * The default engine: there is no account yet, so nothing leaves the device.
 * Changes still accumulate in the outbox, so the day a real engine is dropped in
 * it can replay everything that happened before sign-in.
 */
export const LocalOnlySyncEngine: SyncEngine = {
  id: 'local-only',
  async pull(): Promise<PullResult> {
    return { changes: [], serverTime: Date.now() };
  },
  async push(_changes: Change[]): Promise<PushResult> {
    return { applied: [], serverTime: Date.now() };
  },
};
