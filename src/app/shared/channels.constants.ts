/**
 * @file Identity and seed values of the permanent default channel that every
 * newly registered user joins. It is never auto-deleted, so new users can
 * always find and join it — even when it currently has zero members.
 */

/** Fixed Firestore document id of the default channel (channels/general). */
export const DEFAULT_CHANNEL_ID = 'general';

/** User-facing display name of the default channel. */
export const DEFAULT_CHANNEL_NAME = 'Allgemein';

/** Description shown in the default channel's details. */
export const DEFAULT_CHANNEL_DESCRIPTION =
  'Der allgemeine Channel für alle Mitglieder von DABubble.';

/** createdBy marker for the system-seeded default channel (no real user). */
export const DEFAULT_CHANNEL_CREATED_BY = 'system';
