/**
 * @file Typed shape of the Firestore channel document at channels/{channelId}.
 */
import { FieldValue, Timestamp } from '@angular/fire/firestore';

/**
 * Firestore document stored at channels/{channelId}. Messages live in the
 * subcollection channels/{channelId}/messages.
 */
export interface ChannelDoc {
  /** Channel name without the leading hash. */
  name: string;
  /** Trimmed lowercase copy of name for the global duplicate-name query. */
  nameLower: string;
  /** Short description shown in the channel details. */
  description: string;
  /** Uid of the user who created the channel. */
  createdBy: string;
  /** Uids of all channel members. */
  memberIds: string[];
  /** Creation time; serverTimestamp() sentinel on write, Timestamp on read. */
  createdAt: Timestamp | FieldValue;
  /** True only for the permanent default channel, which is never deleted. */
  isDefault?: boolean;
}

/**
 * Channel document paired with its Firestore document id as read from the
 * channels collection (collectionData idField).
 */
export interface Channel extends ChannelDoc {
  /** Firestore document id of the channel. */
  readonly id: string;
}
