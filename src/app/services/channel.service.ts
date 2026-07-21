/**
 * @file Live stream of the signed-in user's channels and channel creation.
 */
import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  Timestamp,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  collectionData,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { Channel, ChannelDoc } from '../models/channel.model';
import {
  DEFAULT_CHANNEL_CREATED_BY,
  DEFAULT_CHANNEL_DESCRIPTION,
  DEFAULT_CHANNEL_ID,
  DEFAULT_CHANNEL_NAME,
} from '../shared/channels.constants';
import { AuthService } from './auth.service';
import { deleteChannelDeep } from './channel-teardown';
import { ToastService } from './toast.service';
import { tokenGatedStream } from './token-gated-stream';

const CHANNELS_LOAD_ERROR = 'Channels konnten nicht geladen werden.';

/**
 * Streams all channels the signed-in user is a member of and persists new
 * channels. Channels are sorted by creation time so a newly created channel
 * appears at the bottom of the list, as specified in the Figma flow.
 */
@Injectable({ providedIn: 'root' })
export class ChannelService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly toastService = inject(ToastService);

  private readonly injector = inject(EnvironmentInjector);

  private readonly hasLoadedChannelsState = signal(false);

  readonly hasLoadedChannels = this.hasLoadedChannelsState.asReadonly();

  readonly channels = toSignal(this.streamChannels(), { initialValue: [] as Channel[] });


  /**
   * Creates a channel document owned by the signed-in user, who is always
   * part of the member list.
   * @param name Validated, unique channel name.
   * @param description Optional channel description.
   * @param memberIds Uids selected in the add-people step.
   * @returns Firestore document id of the new channel.
   */
  async createChannel(name: string, description: string, memberIds: string[]): Promise<string> {
    const creatorUid = this.authService.requireUid();
    const channel: ChannelDoc = {
      name,
      nameLower: name.trim().toLowerCase(),
      description,
      createdBy: creatorUid,
      memberIds: [...new Set([creatorUid, ...memberIds])],
      createdAt: serverTimestamp(),
    };
    const reference = await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, 'channels'), channel),
    );
    return reference.id;
  }


  /**
   * Idempotently seeds the permanent default channel under its fixed id.
   * An existing document is never overwritten, so its members are preserved.
   */
  async ensureDefaultChannelExists(): Promise<void> {
    const reference = this.inContext(() => doc(this.firestore, `channels/${DEFAULT_CHANNEL_ID}`));
    const snapshot = await this.inContext(() => getDoc(reference));
    if (snapshot.exists()) return;
    await this.inContext(() => setDoc(reference, this.buildDefaultChannelDoc()));
  }


  /**
   * Adds a user to the default channel's member list.
   * @param uid Uid to append via arrayUnion (idempotent for members).
   */
  joinDefaultChannel(uid: string): Promise<void> {
    return this.inContext(() =>
      updateDoc(doc(this.firestore, `channels/${DEFAULT_CHANNEL_ID}`), {
        memberIds: arrayUnion(uid),
      }),
    );
  }


  /**
   * Reads one channel document once (channel docs are readable for any
   * signed-in user), for surfaces outside the member stream such as the
   * invite redeem page.
   * @param channelId Channel document id.
   */
  async getChannelOnce(channelId: string): Promise<Channel | null> {
    const reference = this.inContext(() => doc(this.firestore, `channels/${channelId}`));
    const snapshot = await this.inContext(() => getDoc(reference));
    if (!snapshot.exists()) return null;
    return { ...(snapshot.data() as ChannelDoc), id: snapshot.id };
  }


  /**
   * Builds the seed document of the default channel: no creator, no members
   * and a denormalized nameLower so the duplicate-name query stays consistent.
   */
  private buildDefaultChannelDoc(): ChannelDoc {
    return {
      name: DEFAULT_CHANNEL_NAME,
      nameLower: DEFAULT_CHANNEL_NAME.toLowerCase(),
      description: DEFAULT_CHANNEL_DESCRIPTION,
      createdBy: DEFAULT_CHANNEL_CREATED_BY,
      memberIds: [],
      createdAt: serverTimestamp(),
      isDefault: true,
    };
  }


  /**
   * Checks whether any other channel in the whole collection already uses
   * the given name (case-insensitive, via the denormalized nameLower field).
   * @param name Channel name typed by the user.
   * @param excludeChannelId Channel whose own name does not count (rename).
   */
  isNameTaken(name: string, excludeChannelId?: string): Promise<boolean> {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return Promise.resolve(false);
    return this.inContext(() => this.queryNameTaken(normalized, excludeChannelId ?? null));
  }


  /**
   * Renames a channel and keeps the denormalized nameLower in sync.
   * @param channelId Firestore id of the channel.
   * @param name Validated, unique new channel name.
   */
  renameChannel(channelId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    return this.inContext(() =>
      updateDoc(doc(this.firestore, `channels/${channelId}`), {
        name: trimmed,
        nameLower: trimmed.toLowerCase(),
      }),
    );
  }


  /**
   * Replaces a channel's description; an empty description is allowed.
   * @param channelId Firestore id of the channel.
   * @param description New description text.
   */
  updateDescription(channelId: string, description: string): Promise<void> {
    return this.inContext(() =>
      updateDoc(doc(this.firestore, `channels/${channelId}`), {
        description: description.trim(),
      }),
    );
  }


  /**
   * Replaces a channel's one-line topic (creator only per rules); an empty
   * topic is allowed and hides the header line.
   * @param channelId Firestore id of the channel.
   * @param topic New topic text, trimmed on save.
   */
  updateTopic(channelId: string, topic: string): Promise<void> {
    return this.inContext(() =>
      updateDoc(doc(this.firestore, `channels/${channelId}`), {
        topic: topic.trim(),
      }),
    );
  }


  /**
   * Adds users to a channel atomically; any member may do this.
   * @param channelId Firestore id of the channel.
   * @param memberUids Uids to add to the member list.
   */
  addMembers(channelId: string, memberUids: string[]): Promise<void> {
    return this.inContext(() =>
      updateDoc(doc(this.firestore, `channels/${channelId}`), {
        memberIds: arrayUnion(...memberUids),
      }),
    );
  }


  /**
   * Removes the signed-in user from the channel. When the last member of a
   * non-default channel leaves, the channel is deleted entirely including
   * all messages, thread replies and the creator-owned vanity-slug
   * reservation (client-side recursive delete, see channel-teardown.ts).
   * The default channel is never deleted, so new users can always join it.
   * @param channel Channel the user is leaving.
   */
  async leaveChannel(channel: Channel): Promise<void> {
    const uid = this.authService.requireUid();
    const remaining = channel.memberIds.filter(memberId => memberId !== uid);
    if (remaining.length === 0 && !this.isDefaultChannel(channel)) {
      return deleteChannelDeep(this.firestore, operation => this.inContext(operation), channel, uid);
    }
    await this.inContext(() =>
      updateDoc(doc(this.firestore, `channels/${channel.id}`), { memberIds: arrayRemove(uid) }),
    );
  }


  /**
   * Reports whether a channel is the permanent default channel, which must
   * never be deleted (matched by its fixed id or the isDefault flag).
   * @param channel Channel under consideration.
   */
  private isDefaultChannel(channel: Channel): boolean {
    return channel.id === DEFAULT_CHANNEL_ID || channel.isDefault === true;
  }


  /**
   * Runs a Firebase API call in the injection context; required because
   * AngularFire warns about calls scheduled from event handlers.
   * @param operation Firebase call to execute.
   */
  private inContext<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }


  /**
   * Runs the duplicate-name query; created in the injection context as
   * required by AngularFire.
   * @param nameLower Normalized channel name to look up.
   * @param excludeChannelId Channel id ignored in the comparison.
   */
  private async queryNameTaken(nameLower: string, excludeChannelId: string | null): Promise<boolean> {
    const duplicatesQuery = query(
      collection(this.firestore, 'channels'),
      where('nameLower', '==', nameLower),
    );
    const snapshot = await getDocs(duplicatesQuery);
    return snapshot.docs.some(docSnapshot => docSnapshot.id !== excludeChannelId);
  }


  /**
   * Streams every channel in the workspace, ordered by name — the
   * new-message address list shows all existing channels per checklist
   * US4. Subscribed per consumer, not held open by the service.
   */
  streamAllChannels(): Observable<Channel[]> {
    return this.inContext(() => this.queryAllChannels());
  }


  /**
   * Builds the live all-channels query; on Firestore errors a toast is
   * shown and an empty list keeps the UI functional.
   */
  private queryAllChannels(): Observable<Channel[]> {
    const channelsQuery = query(collection(this.firestore, 'channels'), orderBy('nameLower'));
    return (collectionData(channelsQuery, { idField: 'id' }) as Observable<Channel[]>).pipe(
      catchError(() => this.reportLoadError()),
    );
  }


  /**
   * Streams the user's channels; emits an empty list while signed out so the
   * subscription never reads without permission. Self-healing (see
   * token-gated-stream.ts): an inner error shows the load toast once,
   * degrades to the empty list and re-subscribes on the next ID-token
   * emission. The query is created in the injection context as required by
   * AngularFire.
   */
  private streamChannels(): Observable<Channel[]> {
    return tokenGatedStream({
      source: this.authService.tokenChanges,
      gate: current => current.uid,
      empty: [] as Channel[],
      build: current => runInInjectionContext(this.injector, () => this.queryChannels(current.uid)),
      onError: () => this.toastService.show(CHANNELS_LOAD_ERROR),
      reset: () => this.hasLoadedChannelsState.set(false),
    });
  }


  /**
   * Reads all channels containing the given member live, sorted by creation
   * time; error recovery is attached by the surrounding token-gated stream.
   * @param uid Uid the channel membership is filtered by.
   */
  private queryChannels(uid: string): Observable<Channel[]> {
    const channelsQuery = query(
      collection(this.firestore, 'channels'),
      where('memberIds', 'array-contains', uid),
    );
    return (collectionData(channelsQuery, { idField: 'id' }) as Observable<Channel[]>).pipe(
      map(channels => [...channels].sort((a, b) => createdAtMillis(a) - createdAtMillis(b))),
      tap(() => this.hasLoadedChannelsState.set(true)),
    );
  }


  /**
   * Shows the load-error toast and recovers with an empty list.
   */
  private reportLoadError(): Observable<Channel[]> {
    this.toastService.show(CHANNELS_LOAD_ERROR);
    return of([]);
  }
}


/**
 * Resolves a channel's creation time in milliseconds; documents whose
 * serverTimestamp() is still pending sort to the end of the list.
 * @param channel Channel read from the live stream.
 */
function createdAtMillis(channel: Channel): number {
  return channel.createdAt instanceof Timestamp
    ? channel.createdAt.toMillis()
    : Number.MAX_SAFE_INTEGER;
}
