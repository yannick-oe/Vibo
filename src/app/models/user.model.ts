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
  /**
   * Immutable unique @handle, mirrored by usernames/{username}. Written on
   * every new document; optional only because legacy documents predate the
   * field until the manual migration backfills them.
   */
  username?: string;
  /** Display name; "Gast" for anonymous accounts. */
  name: string;
  /** Account e-mail; null for guest (anonymous) accounts. */
  email: string | null;
  /** Local public asset path (e.g. avatars/avatar-1.jpeg) — never an external URL. */
  avatarPath: string;
  /** Selected profile-banner id (see BANNER_OPTIONS); absent/"none" means no banner. */
  banner?: string;
  /** Free custom status line (character-limited); absent/empty means none. */
  status?: string;
  /** Whether the display name renders with the animated aurora gradient. */
  animatedName?: boolean;
  /** Profile badge ids (see BADGE_OPTIONS); absent falls back to a display default. */
  badges?: string[];
  /** Creation time; serverTimestamp() sentinel on write, Timestamp on read. */
  createdAt: Timestamp | FieldValue;
  /** Last presence heartbeat; serverTimestamp() on write, Timestamp on read. */
  lastActive?: Timestamp | FieldValue;
  /** Session presence, written only on transitions; offline derives from lastActive. */
  presence?: 'online' | 'away';
}
