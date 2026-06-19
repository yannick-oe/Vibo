/**
 * @file Typed shape of the Firestore user document at users/{uid}.
 */
import { FieldValue, Timestamp } from '@angular/fire/firestore';

/**
 * Firestore document stored at users/{uid}. On write, createdAt holds the
 * serverTimestamp() sentinel; on read it resolves to a Timestamp.
 */
export interface UserDoc {
  /** Firebase Auth user id, duplicated for convenient querying. */
  uid: string;
  /** Display name; "Gast" for anonymous accounts. */
  name: string;
  /** Account e-mail; null for guest (anonymous) accounts. */
  email: string | null;
  /** Local public asset path (e.g. avatars/avatar-1.jpeg) — never an external URL. */
  avatarPath: string;
  /** Creation time; serverTimestamp() sentinel on write, Timestamp on read. */
  createdAt: Timestamp | FieldValue;
  /** Last presence heartbeat; serverTimestamp() on write, Timestamp on read. */
  lastActive?: Timestamp | FieldValue;
}
