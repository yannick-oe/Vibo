/**
 * @file Thread panel: origin message, live replies and reply composer.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';

import { GifResult } from '../../../models/gif.model';
import { Message, Reply } from '../../../models/message.model';
import { AuthService } from '../../../services/auth.service';
import { MessageService } from '../../../services/message.service';
import { ThreadStreamsService } from '../../../services/thread-streams.service';
import { NotificationFanoutService } from '../../../services/notification-fanout.service';
import { ReducedMotionService } from '../../../services/reduced-motion.service';
import { ThreadService } from '../../../services/thread.service';
import { ToastService } from '../../../services/toast.service';
import { ScrollToLatestFabComponent } from '../../../shared/scroll-to-latest-fab/scroll-to-latest-fab.component';
import { MessageEntranceTracker } from '../message-entrance';
import { ScrollFabTracker } from '../scroll-fab-tracker';
import { MessageInputComponent } from '../message-input/message-input.component';
import { MessageItemComponent } from '../message-item/message-item.component';

const SEND_ERROR = 'Die Antwort konnte nicht gesendet werden.';
const COMPOSER_PLACEHOLDER = 'Antworten...';
const THREAD_REACTION_LIMIT = 7;
const NEAR_BOTTOM_THRESHOLD_PX = 120;

/**
 * Right-hand thread panel per the Figma frame: header with the context
 * reference and a close button, the origin message, a divider with the
 * reply count, the live reply list and the reply composer, which is
 * focused automatically whenever a thread opens.
 */
@Component({
  selector: 'app-thread-panel',
  imports: [MessageInputComponent, MessageItemComponent, ScrollToLatestFabComponent],
  templateUrl: './thread-panel.component.html',
  styleUrl: './thread-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThreadPanelComponent {
  private readonly threadService = inject(ThreadService);

  private readonly messageService = inject(MessageService);

  private readonly threadStreams = inject(ThreadStreamsService);

  private readonly notificationFanout = inject(NotificationFanoutService);

  private readonly authService = inject(AuthService);

  private readonly toastService = inject(ToastService);

  private readonly reducedMotion = inject(ReducedMotionService);

  private readonly composer = viewChild(MessageInputComponent);

  private readonly replyScroll = viewChild<ElementRef<HTMLElement>>('replyScroll');

  private focusedMessagePath: string | null = null;

  private stickToBottom = true;

  protected readonly composerPlaceholder = COMPOSER_PLACEHOLDER;

  protected readonly reactionLimit = THREAD_REACTION_LIMIT;

  protected readonly entrance = new MessageEntranceTracker();

  protected readonly scrollFab = new ScrollFabTracker();

  protected readonly contextLabel = computed(
    () => this.threadService.thread()?.contextLabel ?? '',
  );

  protected readonly originPath = computed(
    () => this.threadService.thread()?.messagePath ?? null,
  );

  protected readonly origin = toSignal(
    toObservable(this.threadService.thread).pipe(
      switchMap(context =>
        context ? this.threadStreams.streamMessage(context.messagePath) : of(undefined),
      ),
    ),
    { initialValue: undefined as Message | undefined },
  );

  protected readonly replies = toSignal(
    toObservable(this.threadService.thread).pipe(
      switchMap(context =>
        context ? this.threadStreams.streamReplies(context.messagePath) : of([]),
      ),
    ),
    { initialValue: [] as Reply[] },
  );

  protected readonly visibleReplies = computed(() => {
    const uid = this.authService.currentUser()?.uid;
    return this.replies().filter(reply => !uid || !reply.hiddenFor?.includes(uid));
  });

  protected readonly replyCountLabel = computed(() =>
    this.visibleReplies().length === 1
      ? '1 Antwort'
      : `${this.visibleReplies().length} Antworten`,
  );


  /**
   * Builds the Firestore document path of a reply for row actions.
   * @param reply Reply of the rendered row.
   */
  protected replyPathFor(reply: Reply): string | null {
    const originPath = this.originPath();
    return originPath ? `${originPath}/replies/${reply.id}` : null;
  }


  /**
   * Focuses the composer per opened thread and keeps the reply list
   * scrolled to the newest reply.
   */
  constructor() {
    effect(() => this.handleThreadSwitch(this.threadService.thread()?.messagePath ?? null));
    effect(() => this.handleRepliesRendered(this.replies()));
    effect(() => this.scrollFab.sync(this.visibleReplies().length, this.stickToBottom));
  }


  /**
   * Tracks whether the user is near the bottom so new replies only auto-scroll
   * while reading the latest, and feeds the jump button's geometry.
   */
  protected onScroll(): void {
    const element = this.replyScroll()?.nativeElement;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    this.stickToBottom = distance < NEAR_BOTTOM_THRESHOLD_PX;
    this.scrollFab.onScroll(distance, element.clientHeight, this.stickToBottom);
  }


  /**
   * Jumps to the newest reply — instantly under reduced motion — and marks the
   * thread caught up so the jump button hides at once.
   */
  protected jumpToLatest(): void {
    const element = this.replyScroll()?.nativeElement;
    if (!element) return;
    this.stickToBottom = true;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    this.scrollFab.markCaughtUp(distance);
    const behavior = this.reducedMotion.prefersReducedMotion() ? 'auto' : 'smooth';
    element.scrollTo({ top: element.scrollHeight, behavior });
  }


  /**
   * Closes the panel.
   */
  protected close(): void {
    this.threadService.close();
  }


  /**
   * Sends a reply to the origin message, notifies any @mentioned users and
   * fans the thread-reply notification out to the remaining followers (a
   * mentioned follower gets only the mention); failures surface as a toast.
   * @param text Trimmed reply text from the composer.
   */
  protected async sendReply(text: string): Promise<void> {
    const context = this.threadService.thread();
    const origin = this.origin();
    if (!context) return;
    try {
      const replyId = await this.messageService.sendReply(context.messagePath, text);
      const mentioned = this.notificationFanout.mentionsSent(`${context.messagePath}/replies/${replyId}`, text);
      if (origin) this.notificationFanout.threadReplySent(context.messagePath, origin, text, mentioned);
    } catch {
      this.toastService.show(SEND_ERROR);
    }
  }


  /**
   * Sends a GIF reply to the origin message and fans the thread-reply
   * notification out (previewing as "GIF"); failures surface as a toast.
   * @param gif Selected GIF result from the composer.
   */
  protected async sendGifReply(gif: GifResult): Promise<void> {
    const context = this.threadService.thread();
    const origin = this.origin();
    if (!context) return;
    try {
      await this.messageService.sendGifReply(context.messagePath, gif);
      if (origin) this.notificationFanout.threadReplySent(context.messagePath, origin, '', [], gif.url);
    } catch {
      this.toastService.show(SEND_ERROR);
    }
  }


  /**
   * Focuses the reply composer once per opened thread, after rendering.
   * @param messagePath Origin message path of the open thread.
   */
  private handleThreadSwitch(messagePath: string | null): void {
    if (messagePath === null || messagePath === this.focusedMessagePath) return;
    this.focusedMessagePath = messagePath;
    this.stickToBottom = true;
    this.entrance.open();
    this.scrollFab.open();
    requestAnimationFrame(() => this.composer()?.focusInput());
  }


  /**
   * Keeps the reply list scrolled to the newest reply while the user is near
   * the bottom; reading earlier replies is never interrupted.
   * @param replies Rendered replies (effect dependency).
   */
  private handleRepliesRendered(replies: Reply[]): void {
    if (replies.length === 0 || !this.stickToBottom) return;
    requestAnimationFrame(() => {
      const element = this.replyScroll()?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }
}
