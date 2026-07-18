/**
 * @file Client-side validation of a custom-sound upload before anything is
 * written: MIME type against the accepted list, the raw size cap, a real
 * decode (decodeAudioData must succeed) and the duration cap. Oversized or
 * too-long files are rejected with a German hint — never transcoded or
 * silently shrunk. The successful result carries everything the store
 * needs (MIME type, decoded duration, base64 data).
 */
import {
  ACCEPTED_SOUND_MIME_TYPES,
  MAX_SOUND_DURATION_MS,
  MAX_SOUND_FILE_BYTES,
} from '../../../shared/soundboard.constants';

const BYTES_PER_KILOBYTE = 1000;

const MILLISECONDS_PER_SECOND = 1000;

const FILE_TOO_LARGE_ERROR = `Datei zu groß — max. ${MAX_SOUND_FILE_BYTES / BYTES_PER_KILOBYTE} KB`;

const FILE_TOO_LONG_ERROR = `Zu lang — max. ${MAX_SOUND_DURATION_MS / MILLISECONDS_PER_SECOND} Sekunden`;

const FILE_UNSUPPORTED_ERROR = 'Format wird nicht unterstützt';

/** German field hint spelling out the upload caps (shown as the label). */
export const SOUND_FILE_REQUIREMENTS_HINT = `Audiodatei (max. ${
  MAX_SOUND_FILE_BYTES / BYTES_PER_KILOBYTE
} KB, max. ${MAX_SOUND_DURATION_MS / MILLISECONDS_PER_SECOND} Sekunden)`;

/** Seconds label of a decoded duration, one decimal (German locale comma). */
export function durationLabel(durationMs: number): string {
  const seconds = (durationMs / MILLISECONDS_PER_SECOND).toFixed(1).replace('.', ',');
  return `${seconds} s`;
}

/** Validated upload data of an accepted audio file. */
export interface AcceptedSoundFile {
  /** Discriminates the accepted case. */
  readonly ok: true;
  /** Normalized audio MIME type of the file. */
  readonly mimeType: string;
  /** Decoded duration in milliseconds. */
  readonly durationMs: number;
  /** Base64-encoded file bytes. */
  readonly data: string;
}

/** Rejection with the German inline error to show. */
export interface RejectedSoundFile {
  /** Discriminates the rejected case. */
  readonly ok: false;
  /** German inline error message. */
  readonly error: string;
}

/** Result of validating one selected audio file. */
export type SoundFileCheck = AcceptedSoundFile | RejectedSoundFile;


/**
 * Validates a selected audio file against the upload caps: MIME type, raw
 * size, decodability and decoded duration; on success the base64 payload
 * is returned alongside the metadata.
 * @param file File chosen in the upload input.
 * @param decode Decoder resolving encoded bytes to an AudioBuffer.
 */
export async function checkSoundFile(
  file: File,
  decode: (bytes: ArrayBuffer) => Promise<AudioBuffer>,
): Promise<SoundFileCheck> {
  const mimeType = normalizedMimeType(file);
  if (!ACCEPTED_SOUND_MIME_TYPES.includes(mimeType)) return rejected(FILE_UNSUPPORTED_ERROR);
  if (file.size > MAX_SOUND_FILE_BYTES) return rejected(FILE_TOO_LARGE_ERROR);
  const durationMs = await decodedDurationMs(file, decode);
  if (durationMs === null) return rejected(FILE_UNSUPPORTED_ERROR);
  if (durationMs > MAX_SOUND_DURATION_MS) return rejected(FILE_TOO_LONG_ERROR);
  return { ok: true, mimeType, durationMs, data: await encodeBase64(file) };
}


/**
 * Extracts the bare MIME type of a file (codec suffixes stripped).
 * @param file File chosen in the upload input.
 */
function normalizedMimeType(file: File): string {
  return (file.type.split(';')[0] ?? '').trim().toLowerCase();
}


/**
 * Decodes the file and reports its duration in milliseconds; null when the
 * data is not decodable audio.
 * @param file File chosen in the upload input.
 * @param decode Decoder resolving encoded bytes to an AudioBuffer.
 */
async function decodedDurationMs(
  file: File,
  decode: (bytes: ArrayBuffer) => Promise<AudioBuffer>,
): Promise<number | null> {
  try {
    const buffer = await decode(await file.arrayBuffer());
    return Math.round(buffer.duration * MILLISECONDS_PER_SECOND);
  } catch {
    return null;
  }
}


/**
 * Encodes the file bytes as a bare base64 string (data-URL prefix
 * stripped).
 * @param file File chosen in the upload input.
 */
function encodeBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}


/**
 * Builds the rejected result carrying a German inline error.
 * @param error German inline error message.
 */
function rejected(error: string): RejectedSoundFile {
  return { ok: false, error };
}
