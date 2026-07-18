/**
 * @file Channel invite-link documents (invites/{token}): the Firestore
 * shape and the resolved client type. The Firestore auto-generated document
 * id doubles as the unguessable share token.
 */
import { FieldValue, Timestamp } from '@angular/fire/firestore';

/** Firestore document shape of one invite link. */
export interface InviteDoc {
  /** Channel the invite joins. */
  channelId: string;
  /** Uid of the member who created the invite (may revoke it). */
  createdBy: string;
  createdAt: Timestamp | FieldValue;
  /** Client-computed expiry; expired invites are filtered on read. */
  expiresAt: Timestamp;
}

/** Invite resolved from Firestore, with its document id as token. */
export interface Invite extends InviteDoc {
  readonly token: string;
}

/**
 * Firestore document shape of one vanity invite slug at inviteSlugs/{slug}
 * (the document id IS the slug). Claimed and released with the reservation
 * pattern of the usernames registry: the atomic create is the
 * availability check, updates never happen.
 */
export interface InviteSlugDoc {
  /** Channel the slug link joins. */
  channelId: string;
  /** Uid of the channel creator who claimed the slug (may delete it). */
  createdBy: string;
  createdAt: Timestamp | FieldValue;
}
