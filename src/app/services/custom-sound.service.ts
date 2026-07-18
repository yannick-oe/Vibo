/**
 * @file Custom soundboard sounds stored as tiny base64 audio blobs directly
 * in Firestore — the deliberate Spark-compatible pattern (Firebase Storage
 * requires the Blaze billing plan and stays permanently excluded; see
 * DEVIATIONS.md). The list is a ONE-SHOT fetch cached per session (§14: no
 * listener), refreshed after an own create; decoded AudioBuffers are cached
 * per sound id and missing or undecodable ids are negative-cached, so a
 * repeated broadcast of a deleted sound costs at most one read. A sound
 * deleted elsewhere may keep playing from warm caches until reload —
 * tolerated, documented.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext, signal } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
} from '@angular/fire/firestore';

import { CustomSound, CustomSoundDoc } from '../models/soundboard.model';
import { MAX_CUSTOM_SOUNDS, SOUNDBOARD_SOUNDS_COLLECTION } from '../shared/soundboard.constants';
import { AuthService } from './auth.service';
import { SoundService } from './sound.service';

const SORT_LOCALE = 'de';

/** Validated upload payload the add form hands to {@link CustomSoundService.create}. */
export interface CustomSoundUpload {
  /** Trimmed display name. */
  readonly name: string;
  /** Audio MIME type of the encoded file. */
  readonly mimeType: string;
  /** Decoded duration in milliseconds. */
  readonly durationMs: number;
  /** Base64-encoded audio file. */
  readonly data: string;
}

/**
 * Fetches, caches, creates and deletes the custom soundboard sounds and
 * plays them through the shared sound engine's buffer path (master toggle
 * and volume respected). All Firestore access is one-shot; nothing here
 * ever subscribes a listener.
 */
@Injectable({ providedIn: 'root' })
export class CustomSoundService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly soundService = inject(SoundService);

  private readonly injector = inject(EnvironmentInjector);

  private readonly soundsState = signal<CustomSound[]>([]);

  /** Cached custom sounds, sorted by name. */
  readonly sounds = this.soundsState.asReadonly();

  private loaded = false;

  private inFlight: Promise<void> | null = null;

  private readonly bufferCache = new Map<string, AudioBuffer | null>();


  /**
   * Loads the list once per session (the popover calls this on open);
   * concurrent calls coalesce, a failed fetch stays retryable.
   */
  ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    return this.refresh();
  }


  /**
   * Persists a validated upload, enforcing the workspace-wide count cap
   * against the freshly fetched list (creation races are tolerated and
   * documented), then refreshes the cache.
   * @param upload Validated payload from the add form.
   * @returns Whether the sound was stored.
   */
  async create(upload: CustomSoundUpload): Promise<boolean> {
    await this.ensureLoaded();
    if (this.soundsState().length >= MAX_CUSTOM_SOUNDS) return false;
    const document: CustomSoundDoc = {
      name: upload.name,
      createdBy: this.authService.requireUid(),
      createdAt: serverTimestamp(),
      mimeType: upload.mimeType,
      durationMs: upload.durationMs,
      data: upload.data,
    };
    await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, SOUNDBOARD_SOUNDS_COLLECTION), document),
    );
    await this.refresh();
    return true;
  }


  /**
   * Deletes an own custom sound (creator-only, enforced by the rules) and
   * drops it from the session caches; warm caches on other clients may
   * keep playing it until their reload.
   * @param soundId Sound to delete.
   */
  async remove(soundId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `${SOUNDBOARD_SOUNDS_COLLECTION}/${soundId}`)),
    );
    this.bufferCache.delete(soundId);
    this.soundsState.update(sounds => sounds.filter(sound => sound.id !== soundId));
  }


  /**
   * Plays a cached custom sound through the engine's buffer path (used by
   * the popover press and preview — the sound's data is already local).
   * @param sound Custom sound from the cached list.
   */
  async play(sound: CustomSound): Promise<void> {
    const buffer = await this.bufferFor(sound.id, sound.data);
    if (buffer) this.soundService.playBuffer(buffer);
  }


  /**
   * Plays a broadcast custom sound by id (receiver side): served from the
   * caches when warm, otherwise fetched one-shot; ids that do not resolve
   * to a playable sound are negative-cached and ignored silently.
   * @param soundId Sound id from a 'sound' signaling envelope.
   */
  async playById(soundId: string): Promise<void> {
    const cached = this.bufferCache.get(soundId);
    if (cached) return this.soundService.playBuffer(cached);
    if (cached === null) return;
    const data = this.soundsState().find(sound => sound.id === soundId)?.data
      ?? (await this.fetchData(soundId));
    if (data === null) return void this.bufferCache.set(soundId, null);
    const buffer = await this.bufferFor(soundId, data);
    if (buffer) this.soundService.playBuffer(buffer);
  }


  /**
   * Re-fetches the full list once; concurrent calls coalesce into the
   * running fetch. Failures keep the previous list and stay retryable.
   */
  private refresh(): Promise<void> {
    this.inFlight ??= this.fetchList().finally(() => (this.inFlight = null));
    return this.inFlight;
  }


  /**
   * Executes the one-shot list fetch and replaces the cache on success.
   */
  private async fetchList(): Promise<void> {
    try {
      const snapshot = await runInInjectionContext(this.injector, () =>
        getDocs(collection(this.firestore, SOUNDBOARD_SOUNDS_COLLECTION)),
      );
      const sounds = snapshot.docs.map(entry => toCustomSound(entry.id, entry.data()));
      this.soundsState.set(sounds.sort(byName));
      this.loaded = true;
    } catch {
      return;
    }
  }


  /**
   * Fetches a single sound document's base64 data (first-need fetch on the
   * receiver side); null when the document is missing or unreadable.
   * @param soundId Sound document to fetch.
   */
  private async fetchData(soundId: string): Promise<string | null> {
    try {
      const snapshot = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, `${SOUNDBOARD_SOUNDS_COLLECTION}/${soundId}`)),
      );
      return snapshot.exists() ? toCustomSound(soundId, snapshot.data()).data : null;
    } catch {
      return null;
    }
  }


  /**
   * Resolves the decoded buffer of a sound through the per-id cache;
   * undecodable data is negative-cached so it is never retried.
   * @param soundId Cache key of the sound.
   * @param base64 Base64-encoded audio file.
   */
  private async bufferFor(soundId: string, base64: string): Promise<AudioBuffer | null> {
    const cached = this.bufferCache.get(soundId);
    if (cached !== undefined) return cached;
    try {
      const buffer = await this.soundService.decodeSoundBytes(base64ToBytes(base64));
      this.bufferCache.set(soundId, buffer);
      return buffer;
    } catch {
      this.bufferCache.set(soundId, null);
      return null;
    }
  }
}


/**
 * Pairs a custom-sound document with its Firestore id.
 * @param id Firestore document id.
 * @param data Raw document data from the snapshot.
 */
function toCustomSound(id: string, data: unknown): CustomSound {
  return { ...(data as CustomSoundDoc), id };
}


/**
 * Compares two custom sounds by their display name.
 * @param a First custom sound.
 * @param b Second custom sound.
 */
function byName(a: CustomSound, b: CustomSound): number {
  return a.name.localeCompare(b.name, SORT_LOCALE);
}


/**
 * Decodes a base64 string back into the raw audio file bytes.
 * @param base64 Base64-encoded audio file.
 */
function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}
