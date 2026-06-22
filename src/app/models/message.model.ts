/**
 * @file Typed shapes of message and reply documents in the Firestore
 * subcollections .../messages/{messageId} and .../replies/{replyId}.
 */
import { FieldValue, Timestamp } from '@angular/fire/firestore';

import type { EffectKind } from './reactions';

/**
 * Emoji reactions on a message: emoji character mapped to the uids of the
 * users who reacted with it.
 */
export type ReactionMap = Record<string, string[]>;

/**
 * A broadcast big-reaction event written onto a message so every viewer's
 * existing message listener replays it once. The id is deduped per client and
 * the timestamp gates the replay; the type selects the screen effect.
 */
export interface BigReactionEvent {
  /** Client-generated id; each client plays a given id at most once. */
  id: string;
  /** Effect to play: confetti, hearts, rocket or the 😂 laugh burst. */
  type: EffectKind;
  /** Uid of the user who triggered it. */
  by: string;
  /** Trigger time: serverTimestamp() on write, Timestamp on read; gates replay. */
  at: Timestamp | FieldValue;
}

/**
 * Firestore document stored at .../messages/{messageId}/replies/{replyId}.
 * Also the shared base shape of chat messages.
 */
export interface ReplyDoc {
  /** Uid of the message author. */
  authorId: string;
  /** Message text content; empty after deletion for everyone. */
  text: string;
  /** Creation time; serverTimestamp() sentinel on write, Timestamp on read. */
  createdAt: Timestamp | FieldValue;
  /** Emoji reactions keyed by emoji character. */
  reactions: ReactionMap;
  /** Last edit time; serverTimestamp() on write, Timestamp on read, absent when never edited. */
  editedAt?: Timestamp | FieldValue;
  /** Uids that deleted the message only for themselves. */
  hiddenFor?: string[];
  /** Deletion time when deleted for everyone; renders as a tombstone. */
  deletedAt?: Timestamp | FieldValue | null;
  /** Uid of the user who deleted the message for everyone. */
  deletedBy?: string;
  /** Animated GIF URL when the message is a Giphy GIF rather than text. */
  gifUrl?: string;
  /** Still-frame URL rendered instead of the animated GIF under reduced motion. */
  gifStill?: string;
  /** GIF intrinsic width, reserving the bubble aspect ratio (CLS 0). */
  gifWidth?: number;
  /** GIF intrinsic height. */
  gifHeight?: number;
  /** GIF accessible label (the Giphy title). */
  gifAlt?: string;
  /** Latest broadcast big-reaction event, replayed live once for all viewers. */
  lastBigReaction?: BigReactionEvent;
}

/**
 * Firestore document stored at channels/{channelId}/messages/{messageId} or
 * directMessages/{conversationId}/messages/{messageId}. Thread replies live
 * in the replies subcollection; replyCount and lastReplyAt are denormalized
 * here so thread previews need no reply reads.
 */
export interface MessageDoc extends ReplyDoc {
  /** Denormalized number of replies in the replies subcollection. */
  replyCount: number;
  /** Denormalized time of the latest reply; null while no replies exist. */
  lastReplyAt: Timestamp | FieldValue | null;
}

/**
 * Message document paired with its Firestore document id as read from a
 * messages subcollection (collectionData idField).
 */
export interface Message extends MessageDoc {
  /** Firestore document id of the message. */
  readonly id: string;
  /** Snapshot metadata: true while the local write is not yet server-acked. */
  readonly hasPendingWrites?: boolean;
}

/**
 * Reply document paired with its Firestore document id as read from a
 * replies subcollection (collectionData idField).
 */
export interface Reply extends ReplyDoc {
  /** Firestore document id of the reply. */
  readonly id: string;
}

/**
 * Union of everything the shared message item renders: chat messages carry
 * the denormalized thread counters, thread replies do not.
 */
export type ChatEntry = Message | Reply;
