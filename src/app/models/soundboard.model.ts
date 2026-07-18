/**
 * @file Typed shapes of the custom soundboard sound documents at
 * soundboardSounds/{id}: user-uploaded audio stored as a tiny base64 blob
 * directly in Firestore (Spark-compatible tiny-blob pattern — no Firebase
 * Storage). The caps referenced below live in shared/soundboard.constants.ts
 * and are mirrored in firestore.rules.
 */
import { FieldValue, Timestamp } from '@angular/fire/firestore';

/** Firestore document stored at soundboardSounds/{soundId}. */
export interface CustomSoundDoc {
  /** Trimmed display name (max SOUND_NAME_MAX characters). */
  name: string;
  /** Uid of the user who uploaded the sound (delete permission). */
  createdBy: string;
  /** Creation time; serverTimestamp() sentinel on write, Timestamp on read. */
  createdAt: Timestamp | FieldValue;
  /** Audio MIME type of the encoded file (one of the accepted types). */
  mimeType: string;
  /** Decoded duration in milliseconds (max MAX_SOUND_DURATION_MS). */
  durationMs: number;
  /** Base64-encoded audio file (max MAX_SOUND_BASE64_CHARS characters). */
  data: string;
}

/** Custom sound document paired with its Firestore document id. */
export interface CustomSound extends CustomSoundDoc {
  /** Firestore document id — carried as soundId in broadcast envelopes. */
  readonly id: string;
}
