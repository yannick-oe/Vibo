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

import { Message, Reply } from '../../../models/message.model';
import { AuthService } from '../../../services/auth.service';
import { MessageService } from '../../../services/message.service';
import { ThreadService } from '../../../services/thread.service';
import { ToastService } from '../../../services/toast.service';
import { MessageInputComponent } from '../message-input/message-input.component';
import { MessageItemComponent } from '../message-item/message-item.component';

const SEND_ERROR = 'Die Antwort konnte nicht gesendet werden.';
const COMPOSER_PLACEHOLDER = 'Antworten...';
const THREAD_REACTION_LIMIT = 7;

/**
 * Right-hand thread panel per the Figma frame: header with the context
 * reference and a close button, the origin message, a divider with the
 * reply count, the live reply list and the reply composer, which is
 * focused automatically whenever a thread opens.
 */
@Component({
  selector: 'app-thread-panel',
  imports: [MessageInputComponent, MessageItemComponent],
  templateUrl: './thread-panel.component.html',
  styleUrl: './thread-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThreadPanelComponent {
  private readonly threadService = inject(ThreadService);

  private readonly messageService = inject(MessageService);

  private readonly authService = inject(AuthService);

  private readonly toastService = inject(ToastService);

  private readonly composer = viewChild(MessageInputComponent);

  private readonly replyScroll = viewChild<ElementRef<HTMLElement>>('replyScroll');

  private focusedMessagePath: string | null = null;

  protected readonly composerPlaceholder = COMPOSER_PLACEHOLDER;

  protected readonly reactionLimit = THREAD_REACTION_LIMIT;

  protected readonly contextLabel = computed(
    () => this.threadService.thread()?.contextLabel ?? '',
  );

  protected readonly originPath = computed(
    () => this.threadService.thread()?.messagePath ?? null,
  );

  protected readonly origin = toSignal(
    toObservable(this.threadService.thread).pipe(
      switchMap(context =>
        context ? this.messageService.streamMessage(context.messagePath) : of(undefined),
      ),
    ),
    { initialValue: undefined as Message | undefined },
  );

  protected readonly replies = toSignal(
    toObservable(this.threadService.thread).pipe(
      switchMap(context =>
        context ? this.messageService.streamReplies(context.messagePath) : of([]),
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
  }


  /**
   * Closes the panel.
   */
  protected close(): void {
    this.threadService.close();
  }


  /**
   * Sends a reply to the origin message; failures surface as a toast.
   * @param text Trimmed reply text from the composer.
   */
  protected async sendReply(text: string): Promise<void> {
    const context = this.threadService.thread();
    if (!context) return;
    try {
      await this.messageService.sendReply(context.messagePath, text);
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
    requestAnimationFrame(() => this.composer()?.focusInput());
  }


  /**
   * Keeps the reply list scrolled to the newest reply.
   * @param replies Rendered replies (effect dependency).
   */
  private handleRepliesRendered(replies: Reply[]): void {
    if (replies.length === 0) return;
    requestAnimationFrame(() => {
      const element = this.replyScroll()?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }
}
