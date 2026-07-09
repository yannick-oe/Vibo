/**
 * @file Incoming-message notifications. When a message from another user lands
 * in a conversation the user is not currently viewing, a top toast slides in
 * with the sender and a short preview (toast state and sound live in
 * {@link NotificationToastService}).
 *
 * It reuses the sidebar's existing per-conversation small-doc detection
 * ({@link ReadStateService.conversationMeta}) — never a message-collection
 * listener (§14) — and anchors a wall-clock baseline on load so the unread
 * backlog present at sign-in never pops; only messages arriving afterwards
 * notify, deduplicated per conversation by last-message time.
 */
import {
  EnvironmentInjector,
  Injectable,
  computed,
  effect,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Firestore, collection, getDocs, limit, orderBy, query } from '@angular/fire/firestore';
import { Observable, combineLatest, map, of, switchMap } from 'rxjs';

import { MessageDoc } from '../models/message.model';
import { UserDoc } from '../models/user.model';
import { AuthService } from './auth.service';
import { ChannelService } from './channel.service';
import { FriendshipService } from './friendship.service';
import { NotificationFeedService } from './notification-feed.service';
import { NotificationToastService } from './notification-toast.service';
import { ConversationMeta, ReadMarker, ReadStateService } from './read-state.service';
import { UserService } from './user.service';
import { resolveAvatarPath } from './registration.service';
import {
  ConversationWatch,
  buildWatchList,
  millisOf,
  parseOpenKey,
  previewOf,
  sameWatchKeys,
} from './notification.util';
import { conversationKeyOf, resolveMentionedUids } from './notification-feed.util';

const UNKNOWN_SENDER = 'Neue Nachricht';

/** A watched conversation paired with its latest streamed metadata. */
interface WatchMeta {
  readonly watch: ConversationWatch;
  readonly meta: ConversationMeta | undefined;
  readonly marker: ReadMarker | undefined;
}

/**
 * Drives the incoming-message toast and sound from the existing conversation
 * metadata streams.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly router = inject(Router);

  private readonly authService = inject(AuthService);

  private readonly channelService = inject(ChannelService);

  private readonly userService = inject(UserService);

  private readonly readState = inject(ReadStateService);

  private readonly friendshipService = inject(FriendshipService);

  private readonly toastService = inject(NotificationToastService);

  private readonly feedService = inject(NotificationFeedService);

  private readonly injector = inject(EnvironmentInjector);

  private readonly firestore = inject(Firestore);

  private currentUid: string | null = null;

  private baseline = Date.now();

  private readonly seen = new Map<string, number>();

  private readonly entriesState = signal<WatchMeta[]>([]);

  /**
   * Conversations with unread messages (last message newer than the own
   * read marker, sent by someone else), excluding any that a pending mention
   * or inline reply already represents — an activity entry supersedes the
   * generic unread indicator so one event never counts twice (hierarchy
   * mention > reply > generic unread). Consumed by the notification center.
   */
  readonly unreadConversations = computed(() => {
    const superseded = this.supersedingConversationKeys();
    return this.entriesState()
      .filter(entry => this.isUnread(entry) && !superseded.has(entry.watch.key))
      .map(entry => entry.watch);
  });

  /**
   * Total of items awaiting attention (pending incoming friend requests +
   * unread conversations + every unread activity event) — the single source
   * for the bell badge (the sole attention indicator). Each feed document
   * counts once; a superseded conversation is not double-counted.
   */
  readonly attentionCount = computed(
    () =>
      this.pendingRequestCount() +
      this.unreadConversations().length +
      this.feedService.eventCount(),
  );

  private readonly watchList = computed(() => this.buildList(), { equal: sameWatchKeys });


  /**
   * Re-anchors the baseline on every sign-in/out and subscribes to the
   * conversation metadata streams for the lifetime of the app.
   */
  constructor() {
    effect(() => this.anchorForUser(this.authService.currentUser()?.uid ?? null));
    toObservable(this.watchList)
      .pipe(
        switchMap(list =>
          list.length ? combineLatest(list.map(watch => this.watch(watch))) : of([] as WatchMeta[]),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(entries => this.handle(entries));
  }


  /**
   * Resets the load baseline and seen state for the active user, so the
   * unread backlog at sign-in never pops and a logout clears any toast.
   * @param uid Signed-in user's uid, or null when signed out.
   */
  private anchorForUser(uid: string | null): void {
    this.currentUid = uid;
    this.baseline = Date.now();
    this.seen.clear();
    this.entriesState.set([]);
    this.toastService.dismiss();
  }


  /**
   * Builds the watch list for the signed-in user (their channels and direct
   * conversations); empty while signed out. Reads the user signal directly so
   * the computed re-runs on sign-in/out.
   */
  private buildList(): ConversationWatch[] {
    const me = this.authService.currentUser()?.uid;
    if (!me) return [];
    return buildWatchList(me, this.channelService.channels(), this.userService.users());
  }


  /**
   * Streams one conversation's metadata and the own read marker paired
   * with its watch descriptor.
   * @param watch Conversation to watch.
   */
  private watch(watch: ConversationWatch): Observable<WatchMeta> {
    const uid = this.currentUid;
    return combineLatest([
      this.readState.conversationMeta(watch.convPath),
      uid ? this.readState.readMarker(watch.convPath, uid) : of(undefined),
    ]).pipe(map(([meta, marker]) => ({ watch, meta, marker })));
  }


  /**
   * Publishes the snapshot for the unread aggregation and processes every
   * watched conversation for the toast.
   * @param entries Watched conversations with their latest metadata.
   */
  private handle(entries: WatchMeta[]): void {
    this.entriesState.set(entries);
    for (const entry of entries) this.process(entry.watch, entry.meta);
  }


  /**
   * Pending incoming requests whose requester profile is already loaded —
   * mirrors exactly what the notification panel can render, so the bell
   * badge and the panel rows can never disagree.
   */
  private pendingRequestCount(): number {
    const users = this.userService.users();
    return this.friendshipService
      .pendingIncomingUids()
      .filter(uid => users.some(user => user.uid === uid)).length;
  }


  /**
   * The keys of conversations that currently carry a pending mention or inline
   * reply for the signed-in user, so the generic unread indicator can defer to
   * that activity entry (both are main-stream events; thread replies do not
   * supersede as they carry their own bell entry without a "read the
   * conversation" expectation).
   */
  private supersedingConversationKeys(): Set<string> {
    const me = this.authService.currentUser()?.uid;
    if (!me) return new Set();
    return new Set(
      this.feedService
        .groups()
        .filter(group => group.latest.kind === 'mention' || group.latest.kind === 'reply')
        .map(group => conversationKeyOf(group.latest, me)),
    );
  }


  /**
   * True when a conversation's last message is newer than the own read
   * marker and was sent by someone else; a missing marker means unread.
   * @param entry Watched conversation with its latest metadata.
   */
  private isUnread(entry: WatchMeta): boolean {
    const author = entry.meta?.lastMessageAuthorId;
    if (!author || author === this.currentUid) return false;
    return millisOf(entry.meta?.lastMessageAt) > millisOf(entry.marker?.lastReadAt);
  }


  /**
   * Notifies for a genuinely new message: newer than the baseline and the last
   * seen one, from another user, in a conversation that is not open.
   * @param watch Conversation descriptor.
   * @param meta Latest conversation metadata.
   */
  private process(watch: ConversationWatch, meta: ConversationMeta | undefined): void {
    const at = millisOf(meta?.lastMessageAt);
    if (at <= (this.seen.get(watch.key) ?? 0)) return;
    this.seen.set(watch.key, at);
    const author = meta?.lastMessageAuthorId;
    if (at <= this.baseline || !author || author === this.currentUid) return;
    if (watch.key === parseOpenKey(this.router.url)) return;
    void this.notify(watch, author);
  }


  /**
   * Builds and shows the generic new-message toast via the shared toast
   * service (which plays the sound); clicking opens the conversation. A
   * message that @mentions the signed-in user or replies to their own message
   * is left to that activity toast, so only one fires for the same message
   * (deterministic, no race — both checks read the same fetched message).
   * @param watch Conversation the message arrived in.
   * @param authorId Uid of the message author.
   */
  private async notify(watch: ConversationWatch, authorId: string): Promise<void> {
    const message = await this.latestMessageDoc(watch.messagesPath);
    if (this.mentionsMe(message) || this.repliesToMe(message)) return;
    const sender = this.senderDoc(authorId);
    this.toastService.show({
      senderName: sender?.name ?? UNKNOWN_SENDER,
      senderAvatar: resolveAvatarPath(sender?.avatarPath),
      context: this.contextLabel(watch),
      action: null,
      emoji: null,
      preview: previewOf(message),
      open: () => void this.router.navigate(watch.route),
    });
  }


  /**
   * Whether a message @mentions the signed-in user, resolved from its text
   * exactly as the sender's fan-out does — so the toast supersede matches the
   * mention that was written.
   * @param message Latest message document, or undefined.
   */
  private mentionsMe(message: MessageDoc | undefined): boolean {
    const me = this.authService.currentUser()?.uid;
    if (!me || !message) return false;
    return resolveMentionedUids(message.text, this.userService.users()).includes(me);
  }


  /**
   * Whether a message is an inline reply to the signed-in user's own message,
   * read straight from the stored replyTo snapshot — so the reply toast (from
   * the activity feed) wins and the generic new-message toast stays silent.
   * @param message Latest message document, or undefined.
   */
  private repliesToMe(message: MessageDoc | undefined): boolean {
    const me = this.authService.currentUser()?.uid;
    return Boolean(me && message?.replyTo?.authorUid === me);
  }


  /**
   * One-shot read of the conversation's latest message for a short, safe
   * preview; a single bounded read, not a listener. Also used by the
   * notification center when its panel opens.
   * @param messagesPath Path of the conversation's messages collection.
   */
  async latestPreview(messagesPath: string): Promise<string> {
    return previewOf(await this.latestMessageDoc(messagesPath));
  }


  /**
   * One bounded read of the conversation's newest message document, shared by
   * the preview and the mention-supersede check.
   * @param messagesPath Path of the conversation's messages collection.
   */
  private async latestMessageDoc(messagesPath: string): Promise<MessageDoc | undefined> {
    const snapshot = await runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, messagesPath), orderBy('createdAt', 'desc'), limit(1))),
    );
    return snapshot.docs[0]?.data() as MessageDoc | undefined;
  }


  /**
   * The author's user document, or undefined when not yet loaded.
   * @param uid Author uid.
   */
  private senderDoc(uid: string): UserDoc | undefined {
    return this.userService.users().find(user => user.uid === uid);
  }


  /**
   * The context line of a notification: "#channel" for a channel, empty for a
   * direct message.
   * @param watch Conversation descriptor.
   */
  private contextLabel(watch: ConversationWatch): string {
    if (!watch.channelId) return '';
    const channel = this.channelService.channels().find(item => item.id === watch.channelId);
    return channel ? `#${channel.name}` : '';
  }
}
