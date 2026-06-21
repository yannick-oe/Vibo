/**
 * @file Single chat message row shared by the chat lists and the thread
 * panel: bubble, reactions, hover actions, edit mode and tombstone state.
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
  signal,
  viewChild,
} from '@angular/core';

import { ChatEntry, Message } from '../../../models/message.model';
import { AuthService } from '../../../services/auth.service';
import { EffectsService } from '../../../services/effects.service';
import { ReadEntry } from '../../../services/read-state.service';
import { MessageFocusService } from '../../../services/message-focus.service';
import { MessageService } from '../../../services/message.service';
import { RecentEmojiService } from '../../../services/recent-emoji.service';
import { DEFAULT_AVATAR_PATH } from '../../../services/registration.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import { delay, prefersReducedMotion, resolveDate } from './message-item.util';
import { EmojiPickerComponent } from '../emoji-picker/emoji-picker.component';
import { MessageActionsComponent } from '../message-actions/message-actions.component';
import { MessageContentComponent } from '../message-content/message-content.component';
import { ReactionChipsComponent } from '../reaction-chips/reaction-chips.component';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { ReadReceiptComponent } from '../../../shared/read-receipt/read-receipt.component';

const TIME_FORMAT = 'HH:mm';
const UNKNOWN_AUTHOR = 'Unbekannt';
const ACTION_ERROR = 'Die Aktion konnte nicht ausgeführt werden.';
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const LONG_PRESS_MS = 500;
const DESKTOP_REACTION_LIMIT = 20;
const DELETE_POP_MS = 220;

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
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class MessageItemComponent {
  private static instanceCounter = 0;

  readonly entry = input.required<ChatEntry>();

  readonly isThreadable = input(false);

  readonly isThreadOpen = input(false);

  readonly messagePath = input<string | null>(null);

  readonly reactionLimit = input(DESKTOP_REACTION_LIMIT);

  readonly showReceipt = input(false);

  readonly reads = input<ReadEntry[]>([]);

  readonly otherUids = input<string[]>([]);

  readonly enterAnimate = input(false);

  readonly openThread = output<void>();

  private readonly userService = inject(UserService);

  private readonly authService = inject(AuthService);

  private readonly messageService = inject(MessageService);

  private readonly recentEmojiService = inject(RecentEmojiService);

  private readonly effectsService = inject(EffectsService);

  private readonly messageFocusService = inject(MessageFocusService);

  private readonly toastService = inject(ToastService);

  private readonly locale = inject(LOCALE_ID);

  private readonly editTextarea = viewChild<ElementRef<HTMLTextAreaElement>>('editTextarea');

  private readonly host = inject(ElementRef<HTMLElement>);

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;

  private hasObservedDeletion = false;

  private wasDeleted = false;

  protected readonly barOpen = signal(false);

  protected readonly justDeleted = signal(false);

  protected readonly isHiding = signal(false);

  protected readonly editFieldId = `message-edit-${MessageItemComponent.instanceCounter++}`;

  protected readonly isEditing = signal(false);

  protected readonly editText = signal('');

  protected readonly reactionPickerOpen = signal(false);

  protected readonly editPickerOpen = signal(false);

  protected readonly isOwn = computed(
    () => this.entry().authorId === this.authService.currentUser()?.uid,
  );

  protected readonly receiptEntry = computed(() => this.entry() as Message);

  protected readonly focusHighlight = computed(
    () => this.messageFocusService.target() === this.entry().id,
  );

  protected readonly isDeleted = computed(() => Boolean(this.entry().deletedAt));

  protected readonly author = computed(() =>
    this.userService.users().find(user => user.uid === this.entry().authorId),
  );

  protected readonly authorName = computed(() => this.author()?.name ?? UNKNOWN_AUTHOR);

  protected readonly authorAvatarPath = computed(() => this.author()?.avatarPath ?? DEFAULT_AVATAR_PATH);

  protected readonly time = computed(() =>
    formatDate(resolveDate(this.entry().createdAt), TIME_FORMAT, this.locale),
  );

  protected readonly replyCount = computed(() => {
    const entry = this.entry();
    return 'replyCount' in entry ? entry.replyCount : 0;
  });

  protected readonly replyLabel = computed(() =>
    this.replyCount() === 1 ? '1 Antwort' : `${this.replyCount()} Antworten`,
  );

  protected readonly lastReplyTime = computed(() => this.resolveLastReplyTime());

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
    if (!this.isOwn() || this.isDeleted() || !this.messagePath()) return false;
    const createdAt = resolveDate(this.entry().createdAt).getTime();
    return Date.now() - createdAt < EDIT_WINDOW_MS;
  }


  /**
   * Sets the signed-in user's single reaction to `emoji` (replacing any
   * existing one, or toggling it off); adding a reaction records the quick
   * emoji and plays the full-screen effect of a special big reaction.
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
      this.effectsService.playFor(emoji);
    }
    this.barOpen.set(false);
    await this.runAction(() => this.messageService.setReaction(messagePath, emoji, reactions));
  }


  /**
   * Handles an emoji picked in the reaction picker.
   * @param emoji Picked emoji character.
   */
  protected onReactionPicked(emoji: string): void {
    this.reactionPickerOpen.set(false);
    void this.react(emoji);
  }


  /**
   * Enters edit mode with the current text and focuses the textarea.
   */
  protected startEdit(): void {
    this.barOpen.set(false);
    this.editText.set(this.entry().text);
    this.isEditing.set(true);
    requestAnimationFrame(() => this.editTextarea()?.nativeElement.focus());
  }


  /**
   * Leaves edit mode without saving.
   */
  protected cancelEdit(): void {
    this.isEditing.set(false);
    this.editPickerOpen.set(false);
  }


  /**
   * Syncs the edit signal with the textarea.
   * @param event Input event of the edit textarea.
   */
  protected onEditInput(event: Event): void {
    this.editText.set((event.target as HTMLTextAreaElement).value);
  }


  /**
   * Reports whether the edited text is non-empty and actually changed.
   */
  protected canSaveEdit(): boolean {
    const trimmed = this.editText().trim();
    return trimmed.length > 0 && trimmed !== this.entry().text;
  }


  /**
   * Persists the edited text and leaves edit mode.
   */
  protected async saveEdit(): Promise<void> {
    const messagePath = this.messagePath();
    if (!messagePath || !this.canSaveEdit()) return;
    await this.runAction(() => this.messageService.editMessage(messagePath, this.editText().trim()));
    this.cancelEdit();
  }


  /**
   * Inserts a picked emoji at the caret of the edit textarea.
   * @param emoji Picked emoji character.
   */
  protected onEditPicked(emoji: string): void {
    this.editPickerOpen.set(false);
    const element = this.editTextarea()?.nativeElement;
    if (!element) return;
    const start = element.selectionStart ?? element.value.length;
    element.setRangeText(emoji, start, element.selectionEnd ?? start, 'end');
    this.editText.set(element.value);
    element.focus();
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
    const hidden = await this.runAction(() => this.messageService.hideForMe(messagePath));
    if (!hidden) this.isHiding.set(false);
  }


  /**
   * Deletes the message for everyone (tombstone).
   */
  protected async onDeleteForAll(): Promise<void> {
    this.barOpen.set(false);
    const messagePath = this.messagePath();
    if (!messagePath) return;
    await this.runAction(() => this.messageService.deleteForAll(messagePath));
  }


  /**
   * Runs a Firestore action; failures surface as a toast. Returns whether it
   * succeeded so callers can roll back optimistic UI.
   * @param action Asynchronous message operation.
   */
  private async runAction(action: () => Promise<void>): Promise<boolean> {
    try {
      await action();
      return true;
    } catch {
      this.toastService.show(ACTION_ERROR);
      return false;
    }
  }


  /**
   * Formats the latest reply time as HH:mm; empty without replies.
   */
  private resolveLastReplyTime(): string {
    const entry = this.entry();
    if (!('lastReplyAt' in entry) || !entry.lastReplyAt) return '';
    return formatDate(resolveDate(entry.lastReplyAt), TIME_FORMAT, this.locale);
  }
}
