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
