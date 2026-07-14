/**
 * @file Identity and seed values of the permanent default channel that every
 * newly registered user joins. It is never auto-deleted, so new users can
 * always find and join it — even when it currently has zero members.
 */
import { APP_NAME } from './app.constants';

/** Fixed Firestore document id of the default channel (channels/general). */
export const DEFAULT_CHANNEL_ID = 'general';

/** User-facing display name of the default channel. */
export const DEFAULT_CHANNEL_NAME = 'Allgemein';

/** Description shown in the default channel's details. */
export const DEFAULT_CHANNEL_DESCRIPTION =
  `Der allgemeine Channel für alle Mitglieder von ${APP_NAME}.`;

/** createdBy marker for the system-seeded default channel (no real user). */
export const DEFAULT_CHANNEL_CREATED_BY = 'system';

/** Maximum length of the one-line channel topic (mirrored in the rules). */
export const TOPIC_MAX_LENGTH = 120;
