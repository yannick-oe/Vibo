/**
 * @file Shared scrollable message list with date separators, used by the
 * channel chat and direct-message views.
 */
import { formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
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
import { ReadEntry } from '../../../services/read-state.service';
import { LayoutService } from '../../../services/layout.service';
import { MessageFocusService } from '../../../services/message-focus.service';
import { ReducedMotionService } from '../../../services/reduced-motion.service';
import { ScrollToLatestFabComponent } from '../../../shared/scroll-to-latest-fab/scroll-to-latest-fab.component';
import { BigReactionTracker } from '../big-reaction-tracker';
import { MessageEntranceTracker } from '../message-entrance';
import { ScrollFabTracker } from '../scroll-fab-tracker';
import { MessageItemComponent } from '../message-item/message-item.component';

const TODAY_LABEL = 'Heute';
const NEW_DIVIDER_LABEL = 'Neu';
const DATE_KEY_FORMAT = 'yyyy-MM-dd';
const DAY_LABEL_FORMAT = 'EEEE, d. MMMM';
const NEAR_BOTTOM_THRESHOLD_PX = 120;
const FOCUS_HIGHLIGHT_DURATION_MS = 2000;
const DESKTOP_REACTION_LIMIT = 20;
const MOBILE_REACTION_LIMIT = 7;

/** Consecutive messages of one calendar day under a shared separator. */
interface MessageGroup {
  readonly key: string;
  readonly label: string;
  readonly messages: Message[];
}

/**
 * Scrollable message list per Figma frames 06/09: German date separators
 * and shared message rows. Messages can open their thread; the request
 * bubbles up to the owning chat view, which knows the Firestore context.
 * Auto-scrolls to new messages unless the user scrolled up to read
 * history; switching the context (resetKey) re-enables sticking.
 */
@Component({
  selector: 'app-message-list',
  imports: [MessageItemComponent, ScrollToLatestFabComponent],
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageListComponent {
  readonly messages = input.required<Message[]>();

  readonly resetKey = input.required<string>();

  readonly openThreadId = input<string | null>(null);

  readonly collectionPath = input<string | null>(null);

  readonly reads = input<ReadEntry[]>([]);

  readonly otherUids = input<string[]>([]);

  readonly isSelfConversation = input(false);

  readonly unreadSince = input<Timestamp | null>(null);

  readonly threadRequested = output<Message>();

  readonly replyRequested = output<Message>();

  readonly authorSelected = output<string>();

  private readonly locale = inject(LOCALE_ID);

  private readonly authService = inject(AuthService);

  private readonly messageFocusService = inject(MessageFocusService);

  private readonly layoutService = inject(LayoutService);

  private readonly bigReactionService = inject(BigReactionService);

  private readonly reducedMotion = inject(ReducedMotionService);

  protected readonly reactionLimit = computed(() =>
    this.layoutService.isMobile() ? MOBILE_REACTION_LIMIT : DESKTOP_REACTION_LIMIT,
  );

  private readonly scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');

  private stickToBottom = true;

  private renderedResetKey: string | null = null;

  private readonly visibleMessages = computed(() => {
    const uid = this.authService.currentUser()?.uid;
    return this.messages().filter(message => !uid || !message.hiddenFor?.includes(uid));
  });

  private readonly messageById = computed(
    () => new Map(this.visibleMessages().map(message => [message.id, message])),
  );

  protected readonly groups = computed(() => this.groupMessages());

  protected readonly boundaryId = computed(() => this.deriveBoundaryId());

  protected readonly newLabel = NEW_DIVIDER_LABEL;

  protected readonly entrance = new MessageEntranceTracker();

  protected readonly scrollFab = new ScrollFabTracker();

  private readonly bigReaction = new BigReactionTracker();


  /**
   * Builds the Firestore document path of a message for row actions.
   * @param message Message of the rendered row.
   */
  protected messagePathFor(message: Message): string | null {
    const collectionPath = this.collectionPath();
    return collectionPath ? `${collectionPath}/${message.id}` : null;
  }


  /**
   * Resolves the original an inline reply answers so its quoted preview can
   * link to it; only visible (not hidden-for-me) originals resolve, and a
   * missing or deleted one leaves the preview to fall back.
   * @param message Message of the rendered row.
   */
  protected originalOf(message: Message): Message | undefined {
    const id = message.replyTo?.messageId;
    return id ? this.messageById().get(id) : undefined;
  }


  /**
   * Reacts to context switches (scroll reset), message changes
   * (conditional auto-scroll) and a searched message to scroll to.
   */
  constructor() {
    effect(() => this.handleContextSwitch(this.resetKey()));
    effect(() => this.handleMessagesRendered(this.groups()));
    effect(() => this.handleFocusTarget(this.groups()));
    effect(() => this.playBigReactions(this.messages()));
    effect(() => this.scrollFab.sync(this.visibleMessages().length, this.stickToBottom));
    effect(() => this.reanchorOnBoundary(this.boundaryId()));
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
   * Scrolls a searched message into view once it is rendered and clears
   * the highlight after a brief moment.
   * @param groups Rendered message groups (effect dependency).
   */
  private handleFocusTarget(groups: MessageGroup[]): void {
    const targetId = this.messageFocusService.target();
    if (!targetId || !groups.some(group => group.messages.some(m => m.id === targetId))) return;
    this.stickToBottom = false;
    requestAnimationFrame(() => {
      document.getElementById(`message-${targetId}`)?.scrollIntoView({ block: 'center' });
      setTimeout(() => this.messageFocusService.clear(), FOCUS_HIGHLIGHT_DURATION_MS);
    });
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
   * Re-enables sticking to the bottom when the chat context changes.
   * @param resetKey Channel or conversation key of the current context.
   */
  private handleContextSwitch(resetKey: string): void {
    if (resetKey === this.renderedResetKey) return;
    this.renderedResetKey = resetKey;
    this.stickToBottom = true;
    this.entrance.open();
    this.bigReaction.open();
    this.scrollFab.open();
  }


  /**
   * Scrolls to the newest message after rendering while the user is near
   * the bottom; reading history is never interrupted.
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
   * there is none. Stable while reading because the boundary is frozen at open.
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
   * the user is at the latest message. The boundary is derived asynchronously
   * (after the read marker resolves), so inserting the divider would otherwise
   * push the newest messages down; re-anchoring before paint keeps them put
   * (CLS 0). Only fires while sticking to the bottom; scrolled-up insertions are
   * below the viewport or absorbed by browser scroll anchoring.
   * @param boundaryId First-unread message id, or null (effect dependency).
   */
  private reanchorOnBoundary(boundaryId: string | null): void {
    if (!boundaryId || !this.stickToBottom) return;
    requestAnimationFrame(() => {
      const element = this.scrollContainer()?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }


  /**
   * Groups the ordered messages by calendar day for the date separators.
   */
  private groupMessages(): MessageGroup[] {
    const groups: MessageGroup[] = [];
    for (const message of this.visibleMessages()) {
      const date = resolveDate(message.createdAt);
      const key = formatDate(date, DATE_KEY_FORMAT, this.locale);
      const current = groups[groups.length - 1];
      if (current?.key === key) current.messages.push(message);
      else groups.push({ key, label: this.dayLabel(date), messages: [message] });
    }
    return groups;
  }


  /**
   * Builds the separator label: "Heute" for today, otherwise the German
   * long form like "Dienstag, 14. Januar".
   * @param date Calendar day of the group.
   */
  private dayLabel(date: Date): string {
    const dayKey = formatDate(date, DATE_KEY_FORMAT, this.locale);
    const todayKey = formatDate(new Date(), DATE_KEY_FORMAT, this.locale);
    return dayKey === todayKey ? TODAY_LABEL : formatDate(date, DAY_LABEL_FORMAT, this.locale);
  }
}


/**
 * Converts a Firestore timestamp to a Date; pending serverTimestamp()
 * sentinels (just-sent messages) resolve to now.
 * @param value Timestamp field value from a message document.
 */
function resolveDate(value: Message['createdAt']): Date {
  return value instanceof Timestamp ? value.toDate() : new Date();
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
