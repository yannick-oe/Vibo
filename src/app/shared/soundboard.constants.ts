/**
 * @file Shared constants of the custom soundboard sounds: the Firestore
 * collection, the upload caps and the accepted audio MIME types. Custom
 * sounds are stored as tiny base64 blobs directly in Firestore — the
 * deliberate Spark-compatible alternative to Firebase Storage (which would
 * require the Blaze billing plan); the caps below keep every document far
 * under Firestore's 1 MiB document limit and are mirrored in
 * firestore.rules.
 */

/** Firestore collection holding the custom soundboard sound documents. */
export const SOUNDBOARD_SOUNDS_COLLECTION = 'soundboardSounds';

/** Maximum length of a custom sound name (mirrored in firestore.rules). */
export const SOUND_NAME_MAX = 24;

/** Maximum raw size of an uploaded audio file in bytes. */
export const MAX_SOUND_FILE_BYTES = 150_000;

/** Maximum decoded duration of a custom sound in milliseconds. */
export const MAX_SOUND_DURATION_MS = 3_000;

/**
 * Workspace-wide cap of stored custom sounds. Client-enforced only — two
 * clients creating simultaneously can race past it (tolerated, documented
 * in DEVIATIONS.md).
 */
export const MAX_CUSTOM_SOUNDS = 8;

/**
 * Base64 size cap of the stored data field (mirrored in firestore.rules):
 * base64 inflates 3 raw bytes to 4 characters, so the 150 KB raw cap
 * encodes to exactly 200,000 characters.
 */
export const MAX_SOUND_BASE64_CHARS = 200_000;

/** Audio MIME types the upload input accepts. */
export const ACCEPTED_SOUND_MIME_TYPES: readonly string[] = [
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
];
