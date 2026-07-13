/**
 * @file Single chat message row shared by the chat lists and the thread
 * panel: bubble, reactions, hover actions, edit mode and tombstone state.
 */
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
  signal,
  viewChild,
} from '@angular/core';

import { ChatEntry, Message } from '../../../models/message.model';
import { AuthService } from '../../../services/auth.service';
import { BigReactionService } from '../../../services/big-reaction.service';
import { ReadEntry } from '../../../services/read-state.service';
import { MessageFocusService } from '../../../services/message-focus.service';
import { MessageService } from '../../../services/message.service';
import { NotificationFanoutService } from '../../../services/notification-fanout.service';
import { RecentEmojiService } from '../../../services/recent-emoji.service';
import { DEFAULT_AVATAR_PATH } from '../../../services/registration.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import {
  delay,
  messageTime,
  prefersReducedMotion,
  replyPreviewTime,
  runMessageAction,
  withinEditWindow,
} from './message-item.util';
import { MessageEdit } from '../message-edit';
import { EmojiPickerComponent } from '../emoji-picker/emoji-picker.component';
import { MessageActionsComponent } from '../message-actions/message-actions.component';
import { MessageContentComponent } from '../message-content/message-content.component';
import { ReactionChipsComponent } from '../reaction-chips/reaction-chips.component';
import { ReplyQuoteComponent } from '../reply-quote/reply-quote.component';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import { DialogAnchor, anchorAbove, anchorAtPoint } from '../../../shared/dialog-shell/dialog-anchor';
import { LayoutService } from '../../../services/layout.service';
import { ReadReceiptComponent } from '../../../shared/read-receipt/read-receipt.component';

const UNKNOWN_AUTHOR = 'Unbekannt';
const LONG_PRESS_MS = 500;
const DESKTOP_REACTION_LIMIT = 20;
const DELETE_POP_MS = 220;
const NATIVE_MENU_SELECTOR = 'input, textarea, [contenteditable], a[href]';

/**
 * One message row per the Figma chat frames: avatar, author meta, bubble,
 * reaction chips and the hover action bar (quick reactions, picker, thread
 * toggle, own-message options). Own messages can be edited within a
 * 15-minute window and deleted for the user or for everyone; deleted
 * messages render as a tombstone that keeps thread access alive.
 */
@Component({
  selector: 'li[app-message-item]',
  imports: [
    AvatarComponent,
    EmojiPickerComponent,
    MessageActionsComponent,
    MessageContentComponent,
    ReactionChipsComponent,
    ReadReceiptComponent,
    ReplyQuoteComponent,
    DialogShellComponent,
  ],
  templateUrl: './message-item.component.html',
  styleUrl: './message-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'message',
    '[class.message--own]': 'isOwn()',
    '[class.message--focus]': 'focusHighlight()',
    '[class.message--bar-open]': 'barOpen()',
    '[class.message--enter]': 'enterAnimate()',
    '[class.message--hiding]': 'isHiding()',
    '[id]': '"message-" + entry().id',
    '(touchstart)': 'startLongPress()',
    '(touchend)': 'cancelLongPress()',
    '(touchmove)': 'cancelLongPress()',
    '(contextmenu)': 'onContextMenu($event)',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class MessageItemComponent {
  private static instanceCounter = 0;

  readonly entry = input.required<ChatEntry>();

  readonly isThreadable = input(false);

  readonly isThreadOpen = input(false);

  readonly isReplyable = input(false);

  readonly messagePath = input<string | null>(null);

  readonly replyOriginal = input<Message | undefined>(undefined);

  readonly reactionLimit = input(DESKTOP_REACTION_LIMIT);

  readonly showReceipt = input(false);
  readonly reads = input<ReadEntry[]>([]);
  readonly otherUids = input<string[]>([]);
  readonly isSelfConversation = input(false);

  readonly enterAnimate = input(false);

  readonly openThread = output<void>();
  readonly openAuthor = output<string>();
  readonly replyRequested = output<void>();

  private readonly userService = inject(UserService);

  private readonly authService = inject(AuthService);

  private readonly messageService = inject(MessageService);

  private readonly recentEmojiService = inject(RecentEmojiService);

  private readonly bigReactionService = inject(BigReactionService);

  private readonly notificationFanout = inject(NotificationFanoutService);

  private readonly messageFocusService = inject(MessageFocusService);

  private readonly layoutService = inject(LayoutService);

  private readonly toastService = inject(ToastService);

  private readonly locale = inject(LOCALE_ID);

  private readonly editTextarea = viewChild<ElementRef<HTMLTextAreaElement>>('editTextarea');

  private readonly bubbleAnchor = viewChild.required<ElementRef<HTMLElement>>('bubbleAnchor');

  private readonly editSmileBtn = viewChild<ElementRef<HTMLButtonElement>>('editSmileBtn');

  private readonly host = inject(ElementRef<HTMLElement>);

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;

  private hasObservedDeletion = false;

  private wasDeleted = false;

  protected readonly barOpen = signal(false);

  protected readonly justDeleted = signal(false);

  protected readonly isHiding = signal(false);

  protected readonly editFieldId = `message-edit-${MessageItemComponent.instanceCounter++}`;

  protected readonly edit = new MessageEdit(
    this.messageService,
    this.toastService,
    () => this.entry(),
    () => this.messagePath(),
    () => this.editTextarea()?.nativeElement,
  );

  protected readonly reactionPickerOpen = signal(false);

  private readonly pointAnchor = signal<DialogAnchor | null>(null);

  protected readonly pickerAnchor = computed(() => {
    if (!this.reactionPickerOpen()) return null;
    return (
      this.pointAnchor() ??
      anchorAbove(this.bubbleAnchor().nativeElement, this.isOwn() ? 'right' : 'left')
    );
  });

  protected readonly editPickerAnchor = computed(() => {
    const button = this.editSmileBtn();
    return this.edit.pickerOpen() && button
      ? anchorAbove(button.nativeElement, this.isOwn() ? 'right' : 'left')
      : null;
  });

  protected readonly isOwn = computed(
    () => this.entry().authorId === this.authService.currentUser()?.uid,
  );

  protected readonly messageEntry = computed(() => this.entry() as Message);

  protected readonly focusHighlight = computed(
    () => this.messageFocusService.target() === this.entry().id,
  );

  protected readonly isDeleted = computed(() => Boolean(this.entry().deletedAt));

  protected readonly isEdited = computed(() => Boolean(this.entry().editedAt));

  protected readonly author = computed(() =>
    this.userService.users().find(user => user.uid === this.entry().authorId),
  );

  protected readonly authorName = computed(() => this.author()?.name ?? UNKNOWN_AUTHOR);

  protected readonly authorAvatarPath = computed(() => this.author()?.avatarPath ?? DEFAULT_AVATAR_PATH);

  protected readonly time = computed(() => messageTime(this.entry().createdAt, this.locale));

  protected readonly replyCount = computed(() => {
    const entry = this.entry();
    return 'replyCount' in entry ? entry.replyCount : 0;
  });

  protected readonly replyLabel = computed(() =>
    this.replyCount() === 1 ? '1 Antwort' : `${this.replyCount()} Antworten`,
  );

  protected readonly lastReplyTime = computed(() => replyPreviewTime(this.entry(), this.locale));

  protected readonly hasReactions = computed(() =>
    Object.values(this.entry().reactions).some(uids => uids.length > 0),
  );


  /**
   * Plays the tombstone pop only on a genuine not-deleted → deleted transition
   * during this session; a message that loads already deleted does not pop.
   */
  constructor() {
    effect(() => {
      const deleted = this.isDeleted();
      if (this.hasObservedDeletion && deleted && !this.wasDeleted) this.justDeleted.set(true);
      this.hasObservedDeletion = true;
      this.wasDeleted = deleted;
    });
  }


  /**
   * Arms the long-press timer; touch devices have no hover, so a held
   * press opens the action bar (convention — no Figma gesture exists).
   */
  protected startLongPress(): void {
    this.cancelLongPress();
    this.longPressTimer = setTimeout(() => this.barOpen.set(true), LONG_PRESS_MS);
  }


  /**
   * Cancels a pending long press (touch ended or moved).
   */
  protected cancelLongPress(): void {
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
  }


  /**
   * Closes the long-press action bar when tapping outside the row.
   * @param event Document-level click event.
   */
  protected onDocumentClick(event: Event): void {
    if (!this.barOpen()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.barOpen.set(false);
  }


  /**
   * Opens the reaction picker as a desktop right-click context menu, anchored
   * at the cursor. Skipped on touch/coarse pointers (long-press covers those),
   * on tombstones, and when the target owns a native menu (text fields, links),
   * so composing and link context menus stay intact.
   * @param event Contextmenu (right-click) event on the row.
   */
  protected onContextMenu(event: MouseEvent): void {
    if (!this.layoutService.isHoverCapable() || this.isDeleted() || !this.messagePath()) return;
    if (this.isNativeMenuTarget(event.target)) return;
    event.preventDefault();
    this.pointAnchor.set(anchorAtPoint(event.clientX, event.clientY));
    this.reactionPickerOpen.set(true);
  }


  /**
   * Whether the right-click landed on an element owning a native context menu
   * (an input, textarea, editable region or a link) that must be preserved.
   * @param target Element the right-click landed on.
   */
  private isNativeMenuTarget(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest(NATIVE_MENU_SELECTOR) !== null;
  }


  /**
   * Closes the reaction picker and drops any right-click point anchor, so a
   * later open via the action-bar button re-anchors to the bubble.
   */
  protected closeReactionPicker(): void {
    this.reactionPickerOpen.set(false);
    this.pointAnchor.set(null);
  }


  /**
   * Emits the thread toggle and closes the long-press bar.
   */
  protected requestThread(): void {
    this.barOpen.set(false);
    this.openThread.emit();
  }


  /**
   * Reports whether the own message is still inside the 15-minute edit
   * window; evaluated per change detection because it is time-based.
   */
  protected canEditNow(): boolean {
    if (!this.isOwn() || this.isDeleted() || !this.messagePath() || this.entry().gifUrl) return false;
    return withinEditWindow(this.entry().createdAt);
  }


  /**
   * Sets the signed-in user's single reaction to `emoji` (replacing any
   * existing one, or toggling it off); adding records the quick emoji,
   * broadcasts its big-reaction effect (🎉/💖/🚀/😂) to all viewers and
   * notifies the message's author.
   * @param emoji Emoji character to set.
   */
  protected async react(emoji: string): Promise<void> {
    const messagePath = this.messagePath();
    if (!messagePath || this.isDeleted()) return;
    const reactions = this.entry().reactions;
    const uid = this.authService.currentUser()?.uid ?? '';
    const isAdding = !(reactions[emoji] ?? []).includes(uid);
    if (isAdding) {
      this.recentEmojiService.record(emoji);
      this.bigReactionService.onReactionAdded(emoji, messagePath);
      this.notificationFanout.reactionAdded(messagePath, this.entry(), emoji);
    }
    this.barOpen.set(false);
    await runMessageAction(this.toastService, () => this.messageService.setReaction(messagePath, emoji, reactions));
  }


  /**
   * Enters edit mode (delegated to the edit controller) and closes any open
   * long-press bar.
   */
  protected startEdit(): void {
    this.barOpen.set(false);
    this.edit.start();
  }


  /**
   * Hides the message for the signed-in user only; plays a brief collapse-out
   * first (unless reduced motion), then writes the hide — reverting the
   * collapse if the write fails so the row never stays stuck invisible.
   */
  protected async onDeleteForMe(): Promise<void> {
    this.barOpen.set(false);
    const messagePath = this.messagePath();
    if (!messagePath) return;
    const animates = !prefersReducedMotion();
    this.isHiding.set(animates);
    if (animates) await delay(DELETE_POP_MS);
    const hidden = await runMessageAction(this.toastService, () => this.messageService.hideForMe(messagePath));
    if (!hidden) this.isHiding.set(false);
  }


  /**
   * Deletes the message for everyone (tombstone).
   */
  protected async onDeleteForAll(): Promise<void> {
    this.barOpen.set(false);
    const messagePath = this.messagePath();
    if (!messagePath) return;
    await runMessageAction(this.toastService, () => this.messageService.deleteForAll(messagePath));
  }
}
