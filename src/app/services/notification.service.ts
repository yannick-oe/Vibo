/**
 * @file Incoming-message notifications. When a message from another user lands
 * in a conversation the user is not currently viewing, a top toast slides in
 * with the sender and a short preview, and the chat notification sound plays.
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
  Signal,
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

const NOTIFICATION_SOUND_PATH = 'sounds/chat-notification.mp3';
const AUTO_DISMISS_MS = 5000;
const UNKNOWN_SENDER = 'Neue Nachricht';

/** Rendered incoming-message toast: sender, context, preview and target route. */
export interface NotificationToast {
  readonly senderName: string;
  readonly senderAvatar: string;
  readonly context: string;
  readonly preview: string;
  readonly route: string[];
}

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

  private readonly injector = inject(EnvironmentInjector);

  private readonly firestore = inject(Firestore);

  private currentUid: string | null = null;

  private baseline = Date.now();

  private readonly seen = new Map<string, number>();

  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly sound = new Audio(NOTIFICATION_SOUND_PATH);

  private readonly toastState = signal<NotificationToast | null>(null);

  /** The active incoming-message toast, consumed by the toast component. */
  readonly toast: Signal<NotificationToast | null> = this.toastState.asReadonly();

  private readonly entriesState = signal<WatchMeta[]>([]);

  /**
   * Conversations with unread messages (last message newer than the own
   * read marker, sent by someone else), derived from the same small-doc
   * streams that drive the toast — consumed by the notification center.
   */
  readonly unreadConversations = computed(() =>
    this.entriesState()
      .filter(entry => this.isUnread(entry))
      .map(entry => entry.watch),
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
   * Navigates to a notified conversation and dismisses the toast.
   * @param route Router commands of the target conversation.
   */
  open(route: string[]): void {
    void this.router.navigate(route);
    this.dismiss();
  }


  /**
   * Hides the active toast and clears its auto-dismiss timer.
   */
  dismiss(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = null;
    this.toastState.set(null);
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
    this.dismiss();
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
   * Builds and shows the toast for a new message, then plays the sound.
   * @param watch Conversation the message arrived in.
   * @param authorId Uid of the message author.
   */
  private async notify(watch: ConversationWatch, authorId: string): Promise<void> {
    const preview = await this.latestPreview(watch.messagesPath);
    const sender = this.senderDoc(authorId);
    this.toastState.set({
      senderName: sender?.name ?? UNKNOWN_SENDER,
      senderAvatar: resolveAvatarPath(sender?.avatarPath),
      context: this.contextLabel(watch),
      preview,
      route: watch.route,
    });
    this.restartTimer();
    this.playSound();
  }


  /**
   * One-shot read of the conversation's latest message for a short, safe
   * preview; a single bounded read, not a listener. Also used by the
   * notification center when its panel opens.
   * @param messagesPath Path of the conversation's messages collection.
   */
  async latestPreview(messagesPath: string): Promise<string> {
    const snapshot = await runInInjectionContext(this.injector, () =>
      getDocs(query(collection(this.firestore, messagesPath), orderBy('createdAt', 'desc'), limit(1))),
    );
    return previewOf(snapshot.docs[0]?.data() as MessageDoc | undefined);
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


  /**
   * Restarts the auto-dismiss timer for the freshly shown toast.
   */
  private restartTimer(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => this.toastState.set(null), AUTO_DISMISS_MS);
  }


  /**
   * Plays the chat notification sound, restarting it if already playing;
   * browser autoplay rejections are swallowed.
   */
  private playSound(): void {
    this.sound.currentTime = 0;
    this.sound.play().catch(() => undefined);
  }
}
