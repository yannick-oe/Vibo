/**
 * @file Pure set/map builders over the live user documents, extracted from
 * PresenceService for file-size reasons: which uids count as heartbeat-fresh,
 * which session presences read away, and the manual status per user.
 */
import { Timestamp } from '@angular/fire/firestore';

import { UserDoc } from '../models/user.model';
import { ManualStatus } from '../shared/presence-status';


/**
 * Builds the set of uids whose last heartbeat is at or after the cutoff.
 * @param users Live user documents.
 * @param cutoff Oldest still-fresh heartbeat time in milliseconds.
 */
export function collectOnlineUids(users: UserDoc[], cutoff: number): Set<string> {
  const fresh = users.filter(user => lastActiveMs(user) >= cutoff);
  return new Set(fresh.map(user => user.uid));
}


/**
 * Builds the set of uids whose session presence is 'away'.
 * @param users Live user documents.
 */
export function collectAwayUids(users: UserDoc[]): Set<string> {
  const away = users.filter(user => user.presence === 'away');
  return new Set(away.map(user => user.uid));
}


/**
 * Maps every user to their stored sticky manual status choice.
 * @param users Live user documents.
 */
export function collectManualStatuses(users: UserDoc[]): Map<string, ManualStatus | undefined> {
  return new Map(users.map(user => [user.uid, user.manualStatus]));
}


/**
 * Resolves a user's last-active time in milliseconds; missing or still-pending
 * values resolve to 0 so the user is treated as offline.
 * @param user User document read from the live stream.
 */
function lastActiveMs(user: UserDoc): number {
  return user.lastActive instanceof Timestamp ? user.lastActive.toMillis() : 0;
}
