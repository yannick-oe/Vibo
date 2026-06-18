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
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';

import { ChatEntry } from '../../../models/message.model';
import { AuthService } from '../../../services/auth.service';
import { MessageFocusService } from '../../../services/message-focus.service';
import { MessageService } from '../../../services/message.service';
import { RecentEmojiService } from '../../../services/recent-emoji.service';
import { resolveAvatarPath } from '../../../services/registration.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import { parseMentions } from '../mention-parser';
import { EmojiPickerComponent } from '../emoji-picker/emoji-picker.component';
import { MessageActionsComponent } from '../message-actions/message-actions.component';
import { ReactionChipsComponent } from '../reaction-chips/reaction-chips.component';

const TIME_FORMAT = 'HH:mm';
const UNKNOWN_AUTHOR = 'Unbekannt';
const ACTION_ERROR = 'Die Aktion konnte nicht ausgeführt werden.';
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const LONG_PRESS_MS = 500;
const DESKTOP_REACTION_LIMIT = 20;

/**
 * One message row per the Figma chat frames: avatar, author meta, bubble,
 * reaction chips and the hover action bar (quick reactions, picker, thread
 * toggle, own-message options). Own messages can be edited within a
 * 15-minute window and deleted for the user or for everyone; deleted
 * messages render as a tombstone that keeps thread access alive.
 */
@Component({
  selector: 'li[app-message-item]',
  imports: [EmojiPickerComponent, MessageActionsComponent, ReactionChipsComponent],
  templateUrl: './message-item.component.html',
  styleUrl: './message-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'message',
    '[class.message--own]': 'isOwn()',
    '[class.message--focus]': 'focusHighlight()',
    '[class.message--bar-open]': 'barOpen()',
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

  readonly openThread = output<void>();

  private readonly userService = inject(UserService);

  private readonly authService = inject(AuthService);

  private readonly messageService = inject(MessageService);

  private readonly recentEmojiService = inject(RecentEmojiService);

  private readonly messageFocusService = inject(MessageFocusService);

  private readonly toastService = inject(ToastService);

  private readonly locale = inject(LOCALE_ID);

  private readonly editTextarea = viewChild<ElementRef<HTMLTextAreaElement>>('editTextarea');

  private readonly host = inject(ElementRef<HTMLElement>);

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly barOpen = signal(false);

  protected readonly editFieldId = `message-edit-${MessageItemComponent.instanceCounter++}`;

  protected readonly isEditing = signal(false);

  protected readonly editText = signal('');

  protected readonly reactionPickerOpen = signal(false);

  protected readonly editPickerOpen = signal(false);

  protected readonly isOwn = computed(
    () => this.entry().authorId === this.authService.currentUser()?.uid,
  );

  protected readonly focusHighlight = computed(
    () => this.messageFocusService.target() === this.entry().id,
  );

  protected readonly isDeleted = computed(() => Boolean(this.entry().deletedAt));

  protected readonly author = computed(() =>
    this.userService.users().find(user => user.uid === this.entry().authorId),
  );

  protected readonly authorName = computed(() => this.author()?.name ?? UNKNOWN_AUTHOR);

  protected readonly authorAvatar = computed(() => this.resolveAvatar());

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

  protected readonly parsedText = computed(() =>
    parseMentions(this.entry().text, this.userService.users().map(user => user.name)),
  );


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
   * Toggles the signed-in user's reaction; new reactions become the quick
   * emojis of the action bar.
   * @param emoji Emoji character to toggle.
   */
  protected async react(emoji: string): Promise<void> {
    const messagePath = this.messagePath();
    if (!messagePath || this.isDeleted()) return;
    const uids = this.entry().reactions[emoji] ?? [];
    if (!uids.includes(this.authService.currentUser()?.uid ?? '')) {
      this.recentEmojiService.record(emoji);
    }
    this.barOpen.set(false);
    await this.runAction(() => this.messageService.toggleReaction(messagePath, emoji, uids));
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
   * Hides the message for the signed-in user only.
   */
  protected async onDeleteForMe(): Promise<void> {
    this.barOpen.set(false);
    const messagePath = this.messagePath();
    if (!messagePath) return;
    await this.runAction(() => this.messageService.hideForMe(messagePath));
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
   * Runs a Firestore action; failures surface as a toast.
   * @param action Asynchronous message operation.
   */
  private async runAction(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch {
      this.toastService.show(ACTION_ERROR);
    }
  }


  /**
   * Resolves the author's avatar with the placeholder as fallback.
   */
  private resolveAvatar(): string {
    const path = this.author()?.avatarPath;
    return resolveAvatarPath(path);
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


/**
 * Converts a Firestore timestamp to a Date; pending serverTimestamp()
 * sentinels (just-sent messages) resolve to now.
 * @param value Timestamp field value from a message document.
 */
function resolveDate(value: ChatEntry['createdAt']): Date {
  return value instanceof Timestamp ? value.toDate() : new Date();
}
