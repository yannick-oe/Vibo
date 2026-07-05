/**
 * @file Typed shape of the Firestore friendship document at
 * friendships/{friendshipId} plus the deterministic id helper.
 */
import { FieldValue, Timestamp } from '@angular/fire/firestore';

import { buildConversationId } from './direct-message.model';

/** Lifecycle status of a friendship document. */
export type FriendshipStatus = 'pending' | 'accepted';

/** Relationship of the signed-in user to another user, for UI reuse. */
export type RelationshipState = 'none' | 'pendingOutgoing' | 'pendingIncoming' | 'friends';

/**
 * Firestore document stored at friendships/{friendshipId}. A pending doc is
 * an open friend request; accepting flips the status in place, declining,
 * withdrawing and unfriending delete the document.
 */
export interface FriendshipDoc {
  /** The two participant uids, sorted ascending (mirrors the doc id). */
  participants: [string, string];
  /** Uid of the participant who sent the request. */
  requestedBy: string;
  /** Current lifecycle status. */
  status: FriendshipStatus;
  /** Creation time; serverTimestamp() sentinel on write, Timestamp on read. */
  createdAt: Timestamp | FieldValue;
  /** Acceptance time; null while the request is pending. */
  respondedAt: Timestamp | FieldValue | null;
}


/**
 * Builds the deterministic friendship id for a pair of users: both uids
 * sorted and joined with "_" — the same convention as direct-message
 * conversation ids, so a conversation id doubles as its friendship lookup.
 * @param uidA First participant uid.
 * @param uidB Second participant uid.
 */
export function buildFriendshipId(uidA: string, uidB: string): string {
  return buildConversationId(uidA, uidB);
}
