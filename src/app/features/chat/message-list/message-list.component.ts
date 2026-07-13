/**
 * @file Shared scrollable message list with date separators, windowed loading
 * and the unread divider, used by the channel chat and direct-message views.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  LOCALE_ID,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';

import { Message } from '../../../models/message.model';
import { AuthService } from '../../../services/auth.service';
import { BigReactionService } from '../../../services/big-reaction.service';
import { ConversationWindow } from '../../../services/conversation-window';
import { ReadEntry } from '../../../services/read-state.service';
import { LayoutService } from '../../../services/layout.service';
import { MessageFocusService } from '../../../services/message-focus.service';
import { ReducedMotionService } from '../../../services/reduced-motion.service';
import { ToastService } from '../../../services/toast.service';
import { ScrollToLatestFabComponent } from '../../../shared/scroll-to-latest-fab/scroll-to-latest-fab.component';
import { SkeletonComponent } from '../../../shared/skeleton/skeleton.component';
import { BigReactionTracker } from '../big-reaction-tracker';
import { MessageEntranceTracker } from '../message-entrance';
import { SystemMessageComponent } from '../system-message/system-message.component';
import { MessageGroup, groupMessagesByDay } from '../message-grouping';
import { MessagePager } from '../message-pager';
import { ScrollFabTracker } from '../scroll-fab-tracker';
import { MessageItemComponent } from '../message-item/message-item.component';

const NEW_DIVIDER_LABEL = 'Neu';
const NEAR_BOTTOM_THRESHOLD_PX = 120;
const FOCUS_HIGHLIGHT_DURATION_MS = 2000;
const DESKTOP_REACTION_LIMIT = 20;
const MOBILE_REACTION_LIMIT = 7;
const MAX_FOCUS_PAGES = 5;
const FOCUS_TOO_OLD = 'Diese Nachricht liegt weiter zurück und konnte nicht geladen werden.';
const MESSAGE_SKELETON_COUNT = 6;

/**
 * Scrollable message list per Figma frames 06/09: German date separators and
 * shared message rows over a windowed message source (newest page live, older
 * pages fetched on demand as the top sentinel scrolls into view). Auto-scrolls
 * to new messages unless the user scrolled up; switching the context (resetKey)
 * re-enables sticking. Messages open their thread via the owning chat view.
 */
@Component({
  selector: 'app-message-list',
  imports: [MessageItemComponent, ScrollToLatestFabComponent, SkeletonComponent, SystemMessageComponent],
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageListComponent {
  readonly window = input.required<ConversationWindow>();

  readonly resetKey = input.required<string>();

  readonly openThreadId = input<string | null>(null);

  readonly collectionPath = input<string | null>(null);

  readonly reads = input<ReadEntry[]>([]);

  readonly otherUids = input<string[]>([]);

  readonly isSelfConversation = input(false);

  readonly actionsDisabled = input(false);

  readonly unreadSince = input<Timestamp | null>(null);

  readonly startMarker = input('');

  readonly threadRequested = output<Message>();

  readonly replyRequested = output<Message>();

  readonly authorSelected = output<string>();

  private readonly locale = inject(LOCALE_ID);

  private readonly authService = inject(AuthService);

  private readonly messageFocusService = inject(MessageFocusService);

  private readonly layoutService = inject(LayoutService);

  private readonly bigReactionService = inject(BigReactionService);

  private readonly reducedMotion = inject(ReducedMotionService);

  private readonly toastService = inject(ToastService);

  protected readonly reactionLimit = computed(() =>
    this.layoutService.isMobile() ? MOBILE_REACTION_LIMIT : DESKTOP_REACTION_LIMIT,
  );

  private readonly scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');

  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');

  private stickToBottom = true;

  private renderedResetKey: string | null = null;

  private readonly pager = new MessagePager(
    () => this.scrollContainer()?.nativeElement,
    () => this.window(),
    () => this.stickToBottom,
    () => this.visibleMessages()[0]?.id ?? null,
  );

  private focusLoadingFor: string | null = null;

  private prependedCount = 0;

  private prevFirstId: string | null = null;

  protected readonly messages = computed(() => this.window().messages());

  private readonly visibleMessages = computed(() => {
    const uid = this.authService.currentUser()?.uid;
    return this.messages().filter(message => !uid || !message.hiddenFor?.includes(uid));
  });

  private readonly messageById = computed(
    () => new Map(this.visibleMessages().map(message => [message.id, message])),
  );

  protected readonly groups = computed(() => groupMessagesByDay(this.visibleMessages(), this.locale));

  protected readonly boundaryId = computed(() => this.deriveBoundaryId());

  protected readonly newLabel = NEW_DIVIDER_LABEL;

  protected readonly messageSkeletonCount = MESSAGE_SKELETON_COUNT;

  protected readonly entrance = new MessageEntranceTracker();

  protected readonly scrollFab = new ScrollFabTracker();

  private readonly bigReaction = new BigReactionTracker();


  /**
   * Builds the Firestore document path of a message for row actions; null
   * while actions are disabled (blocked conversations), which inertly
   * disables every mutation affordance of the row.
   * @param message Message of the rendered row.
   */
  protected messagePathFor(message: Message): string | null {
    if (this.actionsDisabled()) return null;
    const collectionPath = this.collectionPath();
    return collectionPath ? `${collectionPath}/${message.id}` : null;
  }


  /**
   * Resolves the original an inline reply answers so its quoted preview can link
   * to it; only visible (not hidden-for-me) originals resolve, and one that is
   * missing, deleted or still in an unloaded older page leaves the preview to
   * fall back.
   * @param message Message of the rendered row.
   */
  protected originalOf(message: Message): Message | undefined {
    const id = message.replyTo?.messageId;
    return id ? this.messageById().get(id) : undefined;
  }


  /**
   * Reacts to context switches, message changes (auto-scroll, prepend anchor,
   * big reactions), the unread boundary and a searched message, and observes the
   * top sentinel to page in older history.
   */
  constructor() {
    effect(() => this.handleContextSwitch(this.resetKey()));
    effect(() => this.handleMessagesRendered(this.groups()));
    effect(() => this.handleFocusTarget(this.groups()));
    effect(() => this.playBigReactions(this.messages()));
    effect(() => this.syncScrollFab(this.visibleMessages()));
    effect(() => this.reanchorOnBoundary(this.boundaryId()));
    effect(() => this.pager.restore(this.visibleMessages()[0]?.id ?? null));
    effect(() => this.pager.observe(this.sentinel()?.nativeElement));
    inject(DestroyRef).onDestroy(() => this.pager.dispose());
  }


  /**
   * Plays the screen effect for each message whose broadcast big-reaction event
   * is new since this context opened, reusing the existing message stream (no
   * extra listener) and deduplicating by event id.
   * @param messages Current messages (effect dependency).
   */
  private playBigReactions(messages: Message[]): void {
    for (const fresh of this.bigReaction.collect(messages)) {
      this.bigReactionService.play(fresh.messageId, fresh.type);
    }
  }


  /**
   * Scrolls a searched message into view, loading older pages first when it is
   * outside the loaded window (bounded), and clears the highlight after a moment.
   * @param groups Rendered message groups (effect dependency).
   */
  private handleFocusTarget(groups: MessageGroup[]): void {
    const targetId = this.messageFocusService.target();
    if (!targetId) {
      this.focusLoadingFor = null;
      return;
    }
    if (groups.some(group => group.messages.some(m => m.id === targetId))) return this.scrollToTarget(targetId);
    if (this.focusLoadingFor !== targetId) void this.loadToFocus(targetId);
  }


  /**
   * Scrolls a rendered target row into view and schedules the highlight clear.
   * @param targetId Firestore id of the focused message.
   */
  private scrollToTarget(targetId: string): void {
    this.focusLoadingFor = null;
    this.stickToBottom = false;
    requestAnimationFrame(() => {
      document.getElementById(`message-${targetId}`)?.scrollIntoView({ block: 'center' });
      setTimeout(() => this.messageFocusService.clear(), FOCUS_HIGHLIGHT_DURATION_MS);
    });
  }


  /**
   * Pages older history in until the focused message loads or the cap is hit;
   * beyond the cap a toast explains it and the target is cleared. When found,
   * the message change re-runs handleFocusTarget, which scrolls to it.
   * @param targetId Firestore id of the focused message.
   */
  private async loadToFocus(targetId: string): Promise<void> {
    this.focusLoadingFor = targetId;
    const found = await this.window().loadOlderUntil(
      () => this.visibleMessages().some(m => m.id === targetId),
      MAX_FOCUS_PAGES,
    );
    if (found || this.messageFocusService.target() !== targetId) return;
    this.toastService.show(FOCUS_TOO_OLD);
    this.messageFocusService.clear();
  }


  /**
   * Tracks whether the user is near the bottom; only then new messages may
   * auto-scroll the list.
   */
  protected onScroll(): void {
    const element = this.scrollContainer()?.nativeElement;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    this.stickToBottom = distance < NEAR_BOTTOM_THRESHOLD_PX;
    this.scrollFab.onScroll(distance, element.clientHeight, this.stickToBottom);
  }


  /**
   * Smoothly scrolls to the newest message — instantly under reduced motion —
   * and marks the list caught up so the jump button hides at once.
   */
  protected jumpToLatest(): void {
    const element = this.scrollContainer()?.nativeElement;
    if (!element) return;
    this.stickToBottom = true;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    this.scrollFab.markCaughtUp(distance);
    const behavior = this.reducedMotion.prefersReducedMotion() ? 'auto' : 'smooth';
    element.scrollTo({ top: element.scrollHeight, behavior });
  }


  /**
   * Feeds the jump-to-latest counter, discounting older messages that were
   * paged in above (prepends are not new arrivals below). Tracks the cumulative
   * prepended count via the previous top row's new position.
   * @param messages Current visible messages (effect dependency).
   */
  private syncScrollFab(messages: Message[]): void {
    const oldIndex = this.prevFirstId ? messages.findIndex(m => m.id === this.prevFirstId) : 0;
    if (oldIndex > 0) this.prependedCount += oldIndex;
    this.prevFirstId = messages[0]?.id ?? null;
    this.scrollFab.sync(messages.length - this.prependedCount, this.stickToBottom);
  }


  /**
   * Re-enables sticking to the bottom when the chat context changes and drops
   * any pending prepend anchor from the previous conversation.
   * @param resetKey Channel or conversation key of the current context.
   */
  private handleContextSwitch(resetKey: string): void {
    if (resetKey === this.renderedResetKey) return;
    this.renderedResetKey = resetKey;
    this.stickToBottom = true;
    this.pager.reset();
    this.focusLoadingFor = null;
    this.prependedCount = 0;
    this.prevFirstId = null;
    this.entrance.open();
    this.bigReaction.open();
    this.scrollFab.open();
  }


  /**
   * Scrolls to the newest message after rendering while the user is near the
   * bottom; reading history is never interrupted.
   * @param groups Rendered message groups (effect dependency).
   */
  private handleMessagesRendered(groups: MessageGroup[]): void {
    if (groups.length === 0 || !this.stickToBottom) return;
    requestAnimationFrame(() => {
      const element = this.scrollContainer()?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }


  /**
   * Id of the first message unread since the conversation was opened — newer
   * than the frozen read marker and authored by someone else — or null when
   * there is none. When the true boundary is still in an unloaded older page,
   * this rides the top of the loaded window so the divider never vanishes.
   */
  private deriveBoundaryId(): string | null {
    const since = this.unreadSince();
    if (!since) return null;
    const me = this.authService.currentUser()?.uid;
    const first = this.visibleMessages().find(
      message => message.authorId !== me && isAfter(message.createdAt, since),
    );
    return first?.id ?? null;
  }


  /**
   * Re-pins the list to the bottom when the unread divider first appears while
   * the user is at the latest message, so the async divider insertion keeps the
   * newest messages put (CLS 0). Only fires while sticking to the bottom.
   * @param boundaryId First-unread message id, or null (effect dependency).
   */
  private reanchorOnBoundary(boundaryId: string | null): void {
    if (!boundaryId || !this.stickToBottom) return;
    requestAnimationFrame(() => {
      const element = this.scrollContainer()?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }
}


/**
 * Whether a message createdAt is strictly after the frozen unread boundary;
 * pending sentinels never count (own just-sent messages are excluded by author
 * before this runs, so only stored timestamps reach here).
 * @param value createdAt field value of a message.
 * @param since Frozen unread-boundary timestamp.
 */
function isAfter(value: Message['createdAt'], since: Timestamp): boolean {
  return value instanceof Timestamp && value.toMillis() > since.toMillis();
}
