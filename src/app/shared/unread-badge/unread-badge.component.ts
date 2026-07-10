/**
 * @file Sidebar unread badge for one conversation. Derives the unread state
 * reactively from the conversation's denormalized last-message metadata and
 * the signed-in user's read marker, and shows the unread count (capped at
 * "99+"). Hidden — but space-reserved — when nothing is unread or when its
 * conversation is the active one, so the just-opened row never flashes a stale
 * count during the async mark-as-read window.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Timestamp } from '@angular/fire/firestore';
import { Observable, combineLatest, of, switchMap } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { NotificationFeedService } from '../../services/notification-feed.service';
import { conversationKeyOfPath } from '../../services/notification-feed.util';
import { ConversationMeta, ReadMarker, ReadStateService } from '../../services/read-state.service';

const UNREAD_CAP = 99;
const UNREAD_CAP_LABEL = '99+';
const COUNT_PENDING = -1;
const COUNT_NONE = 0;
const EPOCH_MILLIS = 0;
const PENDING_LABEL = 'Ungelesene Nachrichten';
const COUNT_LABEL_SINGULAR = 'ungelesene Nachricht';
const COUNT_LABEL_PLURAL = 'ungelesene Nachrichten';
const MENTION_ARIA_SUFFIX = 'enthält Erwähnung';
const HYDRATION_DELAY_MS = 1500;

/**
 * Milliseconds of a Firestore timestamp, or the epoch when absent — a missing
 * read marker means everything is unread.
 * @param value Timestamp read from Firestore, or null/undefined.
 */
function millisOf(value: Timestamp | null | undefined): number {
  return value ? value.toMillis() : EPOCH_MILLIS;
}

/**
 * Shows the unread count for a conversation next to its sidebar entry. The
 * host is a persistent polite live region so a rising count is announced and
 * its width is reserved, keeping the row free of layout shift.
 */
@Component({
  selector: 'app-unread-badge',
  templateUrl: './unread-badge.component.html',
  styleUrl: './unread-badge.component.scss',
  host: { role: 'status', '[attr.aria-live]': 'liveRegion()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnreadBadgeComponent {
  readonly conversationPath = input.required<string>();

  readonly messagesPath = input.required<string>();

  readonly isActive = input(false);

  private readonly readState = inject(ReadStateService);

  private readonly authService = inject(AuthService);

  private readonly feedService = inject(NotificationFeedService);

  private readonly uid = computed(() => this.authService.currentUser()?.uid ?? null);

  private readonly meta = toSignal(this.metaStream());

  private readonly marker = toSignal(this.markerStream());

  private readonly count = signal(COUNT_PENDING);

  private readonly hydrated = signal(false);

  protected readonly liveRegion = computed(() => (this.hydrated() ? 'polite' : 'off'));

  protected readonly isUnread = computed(() => this.deriveUnread());

  protected readonly shouldShow = computed(() => this.deriveShouldShow());

  protected readonly hasMention = computed(() => this.shouldShow() && this.mentionPending());

  protected readonly badgeText = computed(() => this.deriveText());

  protected readonly ariaLabel = computed(() => this.deriveAria());


  /**
   * Recounts unread messages whenever the last message or the read marker
   * changes; the live region stays silent until shortly after mount so the
   * unread state present at page load is not announced, only later increments.
   */
  constructor() {
    effect(() => this.refreshCount());
    setTimeout(() => this.hydrated.set(true), HYDRATION_DELAY_MS);
  }


  /**
   * Live stream of the conversation's last-message metadata.
   */
  private metaStream(): Observable<ConversationMeta | undefined> {
    return toObservable(this.conversationPath).pipe(
      switchMap(path => this.readState.conversationMeta(path)),
    );
  }


  /**
   * Live stream of the signed-in user's read marker; empty while signed out.
   */
  private markerStream(): Observable<ReadMarker | undefined> {
    return combineLatest([toObservable(this.conversationPath), toObservable(this.uid)]).pipe(
      switchMap(([path, uid]) => (uid ? this.readState.readMarker(path, uid) : of(undefined))),
    );
  }


  /**
   * True when the last message is newer than the read marker and was sent by
   * someone else (own messages and self-conversations never count).
   */
  private deriveUnread(): boolean {
    const author = this.meta()?.lastMessageAuthorId;
    if (!author || author === this.uid()) return false;
    return millisOf(this.meta()?.lastMessageAt) > millisOf(this.marker()?.lastReadAt);
  }


  /**
   * Whether to render the badge: unread and not the active conversation. The
   * active row drops its badge synchronously on navigation (route-derived via
   * routerLinkActive), so the just-opened conversation never flashes a stale
   * count during the async mark-as-read → recount window.
   */
  private deriveShouldShow(): boolean {
    return this.isUnread() && !this.isActive();
  }


  /**
   * Badge text: the capped count, or empty while the count is still pending.
   */
  private deriveText(): string {
    const value = this.count();
    if (value <= COUNT_NONE) return '';
    return value > UNREAD_CAP ? UNREAD_CAP_LABEL : String(value);
  }


  /**
   * Accessible label announcing the unread count and, for a pending mention,
   * that the conversation contains a mention (never colour-only status).
   */
  private deriveAria(): string {
    const base = this.baseAria();
    return this.hasMention() ? `${base}, ${MENTION_ARIA_SUFFIX}` : base;
  }


  /**
   * The count-only accessible label, e.g. "3 ungelesene Nachrichten"; a
   * generic label while the count is still pending.
   */
  private baseAria(): string {
    const value = this.count();
    if (value <= COUNT_NONE) return PENDING_LABEL;
    const shown = value > UNREAD_CAP ? UNREAD_CAP_LABEL : String(value);
    return `${shown} ${value === 1 ? COUNT_LABEL_SINGULAR : COUNT_LABEL_PLURAL}`;
  }


  /**
   * Whether this conversation carries a pending @mention in the activity feed,
   * matched by the shared conversation-key format; drives the mention variant.
   */
  private mentionPending(): boolean {
    const uid = this.uid();
    if (!uid) return false;
    const key = conversationKeyOfPath(this.conversationPath(), uid);
    return key !== null && this.feedService.mentionedConversationKeys().has(key);
  }


  /**
   * Triggers a fresh server count when unread, otherwise clears it.
   */
  private refreshCount(): void {
    const uid = this.uid();
    const since = this.marker()?.lastReadAt ?? null;
    if (!uid || !this.deriveUnread()) {
      this.count.set(COUNT_NONE);
      return;
    }
    void this.loadCount(since, uid);
  }


  /**
   * Runs the aggregation count; failures (e.g. a missing index) degrade to the
   * pending state so the badge still flags the conversation as unread.
   * @param since Exclusive createdAt lower bound, or null.
   * @param uid Signed-in user's uid.
   */
  private async loadCount(since: Timestamp | null, uid: string): Promise<void> {
    try {
      this.count.set(await this.readState.countUnread(this.messagesPath(), since, uid));
    } catch {
      this.count.set(COUNT_PENDING);
    }
  }
}
