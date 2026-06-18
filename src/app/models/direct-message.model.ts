/**
 * @file Typed shape of the Firestore direct-message conversation document at
 * directMessages/{conversationId} plus the deterministic id helper.
 */
import { FieldValue, Timestamp } from '@angular/fire/firestore';

const CONVERSATION_ID_SEPARATOR = '_';

/**
 * Firestore document stored at directMessages/{conversationId}. Messages
 * (including thread replies) live in the messages subcollection using the
 * same shapes as channel messages.
 */
export interface DirectMessageDoc {
  /** The two participant uids, sorted ascending. */
  participantIds: [string, string];
  /** Creation time; serverTimestamp() sentinel on write, Timestamp on read. */
  createdAt: Timestamp | FieldValue;
}

/**
 * Builds the deterministic conversation id for a pair of users: both uids
 * sorted and joined with "_", so the same pair always maps to one document
 * and the conversation is addressable without a query.
 * @param uidA First participant uid.
 * @param uidB Second participant uid.
 */
export function buildConversationId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join(CONVERSATION_ID_SEPARATOR);
}
