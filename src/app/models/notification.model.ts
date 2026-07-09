/**
 * @file Typed shape of activity-notification documents stored at
 * users/{uid}/notifications/{notificationId}. Thread replies and reactions on
 * a user's messages are not observable through the existing small-doc streams,
 * so the ACTING client fans a notification doc out to each recipient
 * (create-only for foreign users in the security rules); every user observes
 * only their own collection through one narrow, bounded listener (§14).
 */
import { FieldValue, Timestamp } from '@angular/fire/firestore';

/** Kinds of activity a notification document describes. */
export type NotificationKind = 'thread-reply' | 'reaction' | 'mention' | 'reply';

/** Maximum notification documents the per-user feed listener reads. */
export const NOTIFICATION_FEED_LIMIT = 50;

/**
 * Firestore document stored at users/{uid}/notifications/{notificationId}.
 * Exactly one of channelId/conversationId is present and names the
 * conversation the activity happened in; messageId is always a MAIN-stream
 * message (the thread root for thread events, the reacted message otherwise).
 */
export interface NotificationDoc {
  /** Activity kind: a followed-thread reply, a reaction, an @mention or an
   * inline reply to the recipient's own message. */
  kind: NotificationKind;
  /** Uid of the user who acted; enforced to the writer by the rules. */
  actorUid: string;
  /** Channel id when the activity happened in a channel. */
  channelId?: string;
  /** Deterministic conversation id when it happened in a direct message. */
  conversationId?: string;
  /** Main-stream message id: thread root for thread events, else the target. */
  messageId: string;
  /** True when the event happened inside the thread of messageId. */
  inThread: boolean;
  /** Reaction emoji character; present exactly for kind 'reaction'. */
  emoji?: string;
  /** Short sender-built preview of the affected text ("GIF" for GIFs). */
  preview: string;
  /** Creation time: serverTimestamp() on write, Timestamp on read. */
  createdAt: Timestamp | FieldValue;
}

/**
 * Notification document paired with its Firestore document id as read from
 * the recipient's notifications subcollection (collectionData idField).
 */
export interface NotificationEntry extends NotificationDoc {
  /** Firestore document id of the notification. */
  readonly id: string;
}
