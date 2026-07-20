/**
 * @file Recipient side of activity notifications (thread replies, reactions
 * on own messages). Observes ONLY the signed-in user's own bounded
 * users/{uid}/notifications collection — one narrow listener (§14) — and
 * mirrors the established play-once guards: a wall-clock baseline anchored at
 * sign-in plus per-document dedup, so the backlog never re-toasts. Documents
 * whose target is currently in view are auto-cleared (deleted) instead of
 * toasted; clicking a toast or bell entry navigates to the message or thread,
 * and the auto-clear removes the group once the view opens.
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  limit,
  orderBy,
  query,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { NOTIFICATION_FEED_LIMIT, NotificationEntry } from '../models/notification.model';
import { AuthDiagnosticsService } from './auth-diagnostics.service';
import { AuthService } from './auth.service';
import { tokenGatedStream } from './token-gated-stream';
import { ChannelService } from './channel.service';
import { MessageFocusService } from './message-focus.service';
import { ThreadService } from './thread.service';
import { NotificationToastService } from './notification-toast.service';
import { UserService } from './user.service';
import { resolveAvatarStillSrc } from './registration.service';
import { parseOpenKey } from './notification.util';
import {
  NotificationGroup,
  UNKNOWN_ACTOR,
  actionLabel,
  contextLabelOf,
  conversationKeyOf,
  entriesOfGroup,
  groupNotifications,
  notificationMillis,
  rootMessagePath,
  routeOf,
  threadLabelOf,
  toastEmojiOf,
} from './notification-feed.util';

const NOTIFICATIONS_SEGMENT = 'notifications';

/**
 * Streams, groups and clears the signed-in user's activity notifications and
 * raises their toasts.
 */
@Injectable({ providedIn: 'root' })
export class NotificationFeedService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly userService = inject(UserService);

  private readonly channelService = inject(ChannelService);

  private readonly threadService = inject(ThreadService);

  private readonly messageFocusService = inject(MessageFocusService);

  private readonly toastService = inject(NotificationToastService);

  private readonly router = inject(Router);

  private readonly injector = inject(EnvironmentInjector);

  private readonly diagnostics = inject(AuthDiagnosticsService);

  private currentUid: string | null = null;

  private baseline = Date.now();

  private readonly seen = new Set<string>();

  private readonly urlState = signal('');

  private readonly entriesState = signal<NotificationEntry[]>([]);

  private readonly loadedState = signal(false);

  /** Whether the notifications stream has delivered its first snapshot. */
  readonly loaded = this.loadedState.asReadonly();

  /** Coalesced feed (one group per kind and message), newest first. */
  readonly groups: Signal<NotificationGroup[]> = computed(() =>
    groupNotifications(this.entriesState()),
  );

  /**
   * Feed entries whose target is NOT currently in view. The persistent
   * auto-clear deletes viewed documents asynchronously; deriving the badge
   * from this synchronous exclusion means it can never flash while the
   * deletion round-trips.
   */
  private readonly pendingEntries = computed(() =>
    this.entriesState().filter(
      entry => !this.isViewedIn(entry, this.urlState(), this.openThreadPath()),
    ),
  );

  /**
   * Total unread activity events (feed documents, before coalescing) whose
   * target is not currently in view, so the bell badge counts every event
   * rather than every group and never counts the open conversation.
   */
  readonly eventCount: Signal<number> = computed(() => this.pendingEntries().length);

  /**
   * Conversation keys (channel:… / dm:…) that currently carry a pending
   * @mention for the signed-in user, letting the sidebar unread badge switch
   * to its mention variant. Derived from the existing feed — no extra query.
   */
  readonly mentionedConversationKeys: Signal<Set<string>> = computed(() => this.buildMentionKeys());


  /**
   * Re-anchors the baseline on every sign-in/out, subscribes to the own
   * notifications collection, tracks the router URL reactively and
   * auto-clears notifications whose target is currently in view.
   */
  constructor() {
    effect(() => this.anchorForUser(this.authService.currentUser()?.uid ?? null));
    this.buildFeedStream()
      .pipe(takeUntilDestroyed())
      .subscribe(entries => this.handle(entries));
    this.router.events.pipe(takeUntilDestroyed()).subscribe(() => this.urlState.set(this.router.url));
    effect(() => this.clearViewed(this.entriesState(), this.urlState(), this.openThreadPath()));
  }


  /**
   * Builds the self-healing feed stream (see token-gated-stream.ts): empty
   * while signed out, and an inner error degrades to the empty feed
   * silently and re-subscribes on the next ID-token emission.
   */
  private buildFeedStream(): Observable<NotificationEntry[]> {
    return tokenGatedStream({
      label: 'notifications',
      source: this.authService.tokenChanges,
      gate: current => current.uid,
      empty: [] as NotificationEntry[],
      build: current => this.stream(current.uid),
      diagnostics: this.diagnostics,
    });
  }


  /**
   * Navigates to a bell group's message or thread; the auto-clear removes
   * the group's documents once the target view is open.
   * @param group Activated feed group.
   */
  openGroup(group: NotificationGroup): void {
    void this.openTarget(group.latest);
  }


  /**
   * Builds the set of conversation keys with a pending @mention from the
   * coalesced feed; empty while signed out.
   */
  private buildMentionKeys(): Set<string> {
    const me = this.authService.currentUser()?.uid;
    if (!me) return new Set();
    return new Set(
      this.groups()
        .filter(group => group.latest.kind === 'mention')
        .map(group => conversationKeyOf(group.latest, me)),
    );
  }


  /**
   * Dismisses a bell group by deleting every notification document it
   * coalesces (owner-delete); the panel stays open.
   * @param group Group to dismiss.
   */
  dismissGroup(group: NotificationGroup): void {
    void this.deleteEntries(entriesOfGroup(this.entriesState(), group));
  }


  /**
   * Clears the whole activity feed by deleting all of the user's own
   * notification documents ("Alle löschen").
   */
  clearAllActivity(): void {
    void this.deleteEntries(this.entriesState());
  }


  /**
   * Resets the baseline and seen state for the active user so the persisted
   * backlog renders in the bell but never re-toasts.
   * @param uid Signed-in user's uid, or null when signed out.
   */
  private anchorForUser(uid: string | null): void {
    this.currentUid = uid;
    this.baseline = Date.now();
    this.seen.clear();
    this.entriesState.set([]);
  }


  /**
   * Streams the newest slice of the user's own notifications collection;
   * error recovery is attached by the surrounding token-gated stream.
   * @param uid Signed-in user's uid.
   */
  private stream(uid: string): Observable<NotificationEntry[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(
          collection(this.firestore, `users/${uid}/${NOTIFICATIONS_SEGMENT}`),
          orderBy('createdAt', 'desc'),
          limit(NOTIFICATION_FEED_LIMIT),
        ),
        { idField: 'id' },
      ),
    ) as Observable<NotificationEntry[]>;
  }


  /**
   * Publishes a feed snapshot and processes the entries oldest-first, so the
   * newest fresh entry ends up as the visible toast.
   * @param entries Feed entries ordered newest first.
   */
  private handle(entries: NotificationEntry[]): void {
    this.loadedState.set(true);
    this.entriesState.set(entries);
    for (const entry of [...entries].reverse()) this.process(entry);
  }


  /**
   * Toasts a genuinely new entry once: never seen, created after the
   * baseline and not targeting the currently viewed conversation/thread.
   * @param entry Feed entry to process.
   */
  private process(entry: NotificationEntry): void {
    if (this.seen.has(entry.id)) return;
    this.seen.add(entry.id);
    if (notificationMillis(entry) <= this.baseline || this.isViewed(entry)) return;
    this.showToast(entry);
  }


  /**
   * Whether a notification's target is currently in view: the open thread for
   * thread events, the open conversation for main-stream reactions.
   * @param entry Feed entry to check.
   */
  private isViewed(entry: NotificationEntry): boolean {
    return this.isViewedIn(entry, this.router.url, this.openThreadPath());
  }


  /**
   * The isViewed predicate against explicit view state, shared by the toast
   * gate and the reactive auto-clear.
   * @param entry Feed entry to check.
   * @param url Router URL to check against.
   * @param threadPath Open thread's root message path, or null.
   */
  private isViewedIn(entry: NotificationEntry, url: string, threadPath: string | null): boolean {
    if (entry.inThread) return threadPath === rootMessagePath(entry);
    return parseOpenKey(url) === conversationKeyOf(entry, this.currentUid ?? '');
  }


  /**
   * The open thread's root message path, or null while no thread is open.
   */
  private openThreadPath(): string | null {
    return this.threadService.thread()?.messagePath ?? null;
  }


  /**
   * Deletes every notification whose target is currently in view — viewing
   * counts as reading, exactly like the conversation read markers.
   * @param entries Current feed entries.
   * @param url Current router URL.
   * @param threadPath Open thread's root message path, or null.
   */
  private clearViewed(entries: NotificationEntry[], url: string, threadPath: string | null): void {
    const viewed = entries.filter(entry => this.isViewedIn(entry, url, threadPath));
    if (viewed.length > 0) void this.deleteEntries(viewed);
  }


  /**
   * Deletes a batch of own notification documents; failures are swallowed
   * (the next snapshot retries the auto-clear).
   * @param entries Notifications to delete.
   */
  private async deleteEntries(entries: NotificationEntry[]): Promise<void> {
    const uid = this.currentUid;
    if (!uid) return;
    await runInInjectionContext(this.injector, () => {
      const batch = writeBatch(this.firestore);
      for (const entry of entries) {
        batch.delete(doc(this.firestore, `users/${uid}/${NOTIFICATIONS_SEGMENT}/${entry.id}`));
      }
      return batch.commit();
    }).catch(() => undefined);
  }


  /**
   * Shows the toast for a fresh entry: actor, context, action line with the
   * reaction emoji and the preview; clicking opens the message or thread.
   * @param entry Fresh feed entry.
   */
  private showToast(entry: NotificationEntry): void {
    const actor = this.userService.users().find(user => user.uid === entry.actorUid);
    this.toastService.show({
      senderName: actor?.name ?? UNKNOWN_ACTOR,
      senderAvatar: resolveAvatarStillSrc(actor?.avatarPath),
      context: contextLabelOf(entry, this.channelService.channels()),
      action: actionLabel(entry.kind),
      emoji: entry.emoji ? toastEmojiOf(entry.emoji) : null,
      preview: entry.preview,
      open: () => void this.openTarget(entry),
    });
  }


  /**
   * Navigates to the notification's conversation, then opens its thread or
   * focuses the target message. The thread opens on the next frame so the
   * destination view's context-switch handling cannot immediately close it.
   * @param entry Activated feed entry.
   */
  private async openTarget(entry: NotificationEntry): Promise<void> {
    await this.router.navigate(routeOf(entry, this.currentUid ?? ''));
    if (!entry.inThread) return this.messageFocusService.focus(entry.messageId);
    const contextLabel = threadLabelOf(
      entry,
      this.channelService.channels(),
      this.userService.users(),
      this.currentUid ?? '',
    );
    const context = { messagePath: rootMessagePath(entry), contextLabel };
    requestAnimationFrame(() => this.threadService.open(context));
  }
}
