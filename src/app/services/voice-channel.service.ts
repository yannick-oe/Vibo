/**
 * @file Voice-channel list and creation. Deliberately NOT a live listener
 * (§14 listener budget: the single sanctioned persistent voice listener is
 * the participants collection-group stream in VoiceRosterService): the list
 * is a one-shot fetch, refreshed on sign-in, after an own create and when
 * the roster stream references a channel id the list does not know yet —
 * so a channel created elsewhere appears as soon as somebody joins it. An
 * empty foreign channel becomes visible with the next sign-in/reload; this
 * trade-off is documented in DEVIATIONS.md.
 */
import {
  EnvironmentInjector,
  Injectable,
  effect,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';

import { VoiceChannel, VoiceChannelDoc } from '../models/voice.model';
import { VOICE_CHANNELS_COLLECTION } from '../shared/voice.constants';
import { AuthService } from './auth.service';

const SORT_LOCALE = 'de';

/**
 * Fetches and caches the voice-channel list and persists new voice
 * channels. Creation mirrors the text-channel gating exactly: every
 * signed-in user, including the shared guest account, may create one.
 */
@Injectable({ providedIn: 'root' })
export class VoiceChannelService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly injector = inject(EnvironmentInjector);

  private readonly channelsState = signal<VoiceChannel[]>([]);

  /** Cached voice channels, sorted by creation time like text channels. */
  readonly channels = this.channelsState.asReadonly();

  private inFlight = false;


  /**
   * Loads the list on sign-in and clears it on sign-out.
   */
  constructor() {
    effect(() => {
      if (this.authService.currentUser()) return void this.refresh();
      this.channelsState.set([]);
    });
  }


  /**
   * Re-fetches the voice-channel list once; concurrent calls coalesce into
   * the running fetch. Failures keep the previous list (best effort).
   */
  async refresh(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const snapshot = await runInInjectionContext(this.injector, () =>
        getDocs(collection(this.firestore, VOICE_CHANNELS_COLLECTION)),
      );
      const channels = snapshot.docs.map(entry => toVoiceChannel(entry.id, entry.data()));
      this.channelsState.set(channels.sort(byCreation));
    } catch {
      return;
    } finally {
      this.inFlight = false;
    }
  }


  /**
   * Creates a voice-channel document owned by the signed-in user and
   * refreshes the cached list so the new channel appears immediately.
   * @param name Trimmed channel name (validated by the dialog).
   * @returns Firestore document id of the new voice channel.
   */
  async createVoiceChannel(name: string): Promise<string> {
    const channel: VoiceChannelDoc = {
      name: name.trim(),
      createdBy: this.authService.requireUid(),
      createdAt: serverTimestamp(),
    };
    const reference = await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, VOICE_CHANNELS_COLLECTION), channel),
    );
    await this.refresh();
    return reference.id;
  }


  /**
   * Renames a voice channel (creator-only, enforced by the rules) and
   * refreshes the cached list so the acting client sees the new name
   * immediately; other clients pick it up with their next list refresh.
   * @param channelId Voice channel to rename.
   * @param name New trimmed name (validated by the dialog).
   */
  async rename(channelId: string, name: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `${VOICE_CHANNELS_COLLECTION}/${channelId}`), {
        name: name.trim(),
      }),
    );
    await this.refresh();
  }


  /**
   * Deletes a voice channel document (creator-only, enforced by the rules;
   * the dialog additionally gates on an empty roster) and refreshes the
   * cached list. Residual participant documents from a join race age out
   * via the client-side stale filter.
   * @param channelId Voice channel to delete.
   */
  async remove(channelId: string): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `${VOICE_CHANNELS_COLLECTION}/${channelId}`)),
    );
    await this.refresh();
  }


  /**
   * Reports whether a channel id is missing from the cached list, so the
   * roster stream can trigger a refresh for channels created elsewhere.
   * @param channelId Channel id referenced by a live participant.
   */
  isUnknownChannel(channelId: string): boolean {
    return !this.channelsState().some(channel => channel.id === channelId);
  }
}


/**
 * Pairs a voice-channel document with its Firestore id.
 * @param id Firestore document id.
 * @param data Raw document data from the snapshot.
 */
function toVoiceChannel(id: string, data: unknown): VoiceChannel {
  return { ...(data as VoiceChannelDoc), id };
}


/**
 * Compares two voice channels by creation time with a name tiebreak;
 * documents whose serverTimestamp() is still pending sort to the end.
 * @param a First voice channel.
 * @param b Second voice channel.
 */
function byCreation(a: VoiceChannel, b: VoiceChannel): number {
  return createdAtMillis(a) - createdAtMillis(b) || a.name.localeCompare(b.name, SORT_LOCALE);
}


/**
 * Resolves a channel's creation time in milliseconds; pending server
 * timestamps sort last.
 * @param channel Voice channel read from the fetch.
 */
function createdAtMillis(channel: VoiceChannel): number {
  return channel.createdAt instanceof Timestamp
    ? channel.createdAt.toMillis()
    : Number.MAX_SAFE_INTEGER;
}
