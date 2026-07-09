/**
 * @file Message composer card with growing textarea, emoji insertion,
 * mention suggestions and send handling.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { GifResult } from '../../../models/gif.model';
import { ChannelService } from '../../../services/channel.service';
import { PresenceService } from '../../../services/presence.service';
import { resolveAvatarPath } from '../../../services/registration.service';
import { TypingService } from '../../../services/typing.service';
import { UserService } from '../../../services/user.service';
import { parseMentions } from '../mention-parser';
import {
  Suggestion,
  SuggestionDropdownComponent,
} from '../../../shared/suggestion-dropdown/suggestion-dropdown.component';
import { EmojiPickerComponent } from '../emoji-picker/emoji-picker.component';
import { GifPickerComponent } from '../gif-picker/gif-picker.component';

const MAX_TEXTAREA_HEIGHT_PX = 200;

/** Open mention context inside the textarea. */
interface MentionState {
  readonly type: '@' | '#';
  readonly query: string;
  readonly start: number;
}

/** Display data for the composer's inline-reply context bar. */
export interface ReplyContext {
  readonly authorName: string;
  readonly previewText: string;
}

/**
 * Presentational composer per the Figma frames: outlined card with a
 * growing textarea, the emoji picker (inserts at the caret), mention
 * dropdowns for "@" (members) and "#" (channels) per the component sheet
 * and a send button. Enter sends (or picks the active suggestion while a
 * dropdown is open), Shift+Enter inserts a newline; trimmed-empty input
 * or an externally disabled state block sending.
 */
@Component({
  selector: 'app-message-input',
  imports: [EmojiPickerComponent, GifPickerComponent, SuggestionDropdownComponent],
  templateUrl: './message-input.component.html',
  styleUrl: './message-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageInputComponent {
  private static instanceCounter = 0;

  readonly placeholder = input.required<string>();

  readonly sendDisabled = input(false);

  readonly gifEnabled = input(true);

  readonly conversationPath = input<string | null>(null);

  readonly replyContext = input<ReplyContext | null>(null);

  readonly send = output<string>();

  readonly sendGif = output<GifResult>();

  readonly cancelReply = output<void>();

  private readonly userService = inject(UserService);

  private readonly channelService = inject(ChannelService);

  private readonly presenceService = inject(PresenceService);

  private readonly typingService = inject(TypingService);

  private readonly textarea = viewChild.required<ElementRef<HTMLTextAreaElement>>('textarea');

  private readonly backdrop = viewChild<ElementRef<HTMLDivElement>>('backdrop');

  protected readonly inputId = `composer-text-${MessageInputComponent.instanceCounter++}`;

  protected readonly suggestionIdPrefix = `${this.inputId}-suggestion`;

  protected readonly text = signal('');

  protected readonly pickerOpen = signal(false);

  protected readonly gifPickerOpen = signal(false);

  protected readonly mention = signal<MentionState | null>(null);

  protected readonly activeIndex = signal(0);

  protected readonly canSend = computed(
    () => !this.sendDisabled() && this.text().trim().length > 0,
  );

  protected readonly suggestions = computed(() => this.buildSuggestions());

  protected readonly parsedText = computed(() =>
    parseMentions(this.text(), this.userService.users().map(user => user.name)),
  );

  /**
   * Focuses the textarea; called by the parent on channel switches.
   */
  focusInput(): void {
    this.textarea().nativeElement.focus();
  }


  /**
   * Syncs the signal with the textarea, grows it with its content and
   * tracks an open mention at the caret.
   * @param event Input event of the textarea.
   */
  protected onInput(event: Event): void {
    const element = event.target as HTMLTextAreaElement;
    this.text.set(element.value);
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
    this.syncMention(element);
    this.signalTyping();
  }


  /**
   * Syncs the scroll position of the backdrop with the textarea.
   * @param event Scroll event of the textarea.
   */
  protected onScroll(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    const backdrop = this.backdrop()?.nativeElement;
    if (backdrop) {
      backdrop.scrollTop = textarea.scrollTop;
    }
  }


  /**
   * Handles composer keys: suggestion navigation while a mention dropdown is
   * open, Escape cancels an open reply context, otherwise Enter sends
   * (Shift+Enter falls through).
   * @param event Keydown event of the textarea.
   */
  protected onKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    if (this.mention() !== null && this.handleMentionKey(event)) return;
    if (event.key === 'Escape' && this.replyContext()) return this.cancelReply.emit();
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }


  /**
   * Inserts a picked emoji at the caret and keeps focus in the field.
   * @param emoji Picked emoji character.
   */
  protected insertEmoji(emoji: string): void {
    this.pickerOpen.set(false);
    const element = this.textarea().nativeElement;
    const start = element.selectionStart ?? element.value.length;
    element.setRangeText(emoji, start, element.selectionEnd ?? start, 'end');
    this.text.set(element.value);
    element.focus();
  }


  /**
   * Sends a GIF picked in the modal picker and closes it.
   * @param gif Selected GIF.
   */
  protected onGifPicked(gif: GifResult): void {
    this.gifPickerOpen.set(false);
    this.sendGif.emit(gif);
  }


  /**
   * Toggles the member dropdown via the @ button, inserting the trigger
   * character at the caret as if it was typed; a separating space is
   * added when the caret follows other text so the trigger stays valid.
   */
  protected toggleMentionButton(): void {
    if (this.mention()?.type === '@') return this.mention.set(null);
    const element = this.textarea().nativeElement;
    const start = element.selectionStart ?? element.value.length;
    const needsSpace = start > 0 && !/\s/.test(element.value[start - 1]);
    element.setRangeText(needsSpace ? ' @' : '@', start, element.selectionEnd ?? start, 'end');
    this.text.set(element.value);
    element.focus();
    this.syncMention(element);
  }


  /**
   * Replaces the open mention token with the picked suggestion as plain
   * text ("@Name " / "#channelname ") and closes the dropdown.
   * @param suggestion Picked suggestion row.
   */
  protected pickSuggestion(suggestion: Suggestion): void {
    const mention = this.mention();
    if (!mention) return;
    const element = this.textarea().nativeElement;
    const caret = element.selectionStart ?? element.value.length;
    element.setRangeText(`${mention.type}${suggestion.label} `, mention.start, caret, 'end');
    this.text.set(element.value);
    this.mention.set(null);
    element.focus();
  }


  /**
   * Emits the trimmed text, clears the composer and keeps focus. The DOM
   * value is cleared imperatively: the value binding may have never seen
   * the typed text (zoneless change detection coalesces), so resetting the
   * signal alone would not reliably clear the textarea.
   */
  protected submit(): void {
    if (!this.canSend()) return;
    this.send.emit(this.text().trim());
    this.stopTyping();
    this.text.set('');
    this.mention.set(null);
    const element = this.textarea().nativeElement;
    element.value = '';
    element.style.height = 'auto';
    element.focus();
  }


  /**
   * Clears typing state when the composer loses focus.
   */
  protected onBlur(): void {
    this.stopTyping();
  }


  /**
   * Reports typing activity for the bound conversation, if one is set.
   */
  private signalTyping(): void {
    const path = this.conversationPath();
    if (path) this.typingService.notifyTyping(path);
  }


  /**
   * Clears typing state for the bound conversation, if one is set.
   */
  private stopTyping(): void {
    const path = this.conversationPath();
    if (path) this.typingService.clearTyping(path);
  }


  /**
   * Navigates and resolves the mention dropdown from the keyboard.
   * @param event Keydown event while the dropdown is open.
   * @returns True when the key was consumed by the dropdown.
   */
  private handleMentionKey(event: KeyboardEvent): boolean {
    if (this.moveActiveSuggestion(event)) return true;
    if (event.key === 'Enter' && this.suggestions().length > 0) {
      event.preventDefault();
      this.pickSuggestion(this.suggestions()[this.activeIndex()]);
      return true;
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.mention.set(null);
      return true;
    }
    return false;
  }


  /**
   * Moves the active suggestion with the arrow keys, wrapping around.
   * @param event Keydown event while the dropdown is open.
   * @returns True when an arrow key was handled.
   */
  private moveActiveSuggestion(event: KeyboardEvent): boolean {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false;
    event.preventDefault();
    const count = this.suggestions().length;
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    this.activeIndex.set((this.activeIndex() + delta + count) % Math.max(count, 1));
    return true;
  }


  /**
   * Detects an open mention token at the caret and resets the selection.
   * @param element Composer textarea.
   */
  private syncMention(element: HTMLTextAreaElement): void {
    const caret = element.selectionStart ?? element.value.length;
    this.mention.set(detectMention(element.value, caret));
    this.activeIndex.set(0);
  }


  /**
   * Builds the suggestion rows for the open mention type, filtered live
   * by the typed query.
   */
  private buildSuggestions(): Suggestion[] {
    const mention = this.mention();
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    if (mention.type === '#') return this.channelSuggestions(query);
    return this.userSuggestions(query);
  }


  /**
   * Builds the "#" channel suggestions matching the typed query.
   * @param query Lowercased text typed after the trigger.
   */
  private channelSuggestions(query: string): Suggestion[] {
    return this.channelService
      .channels()
      .filter(channel => channel.name.toLowerCase().includes(query))
      .map(channel => ({ id: channel.id, label: channel.name, isHash: true }));
  }


  /**
   * Builds the "@" member suggestions, tagging each row with live presence.
   * @param query Lowercased text typed after the trigger.
   */
  private userSuggestions(query: string): Suggestion[] {
    return this.userService
      .users()
      .filter(user => user.name.toLowerCase().includes(query))
      .map(user => ({
        id: user.uid,
        label: user.name,
        avatar: avatarUrl(user.avatarPath),
        online: this.presenceService.isOnline(user.uid),
      }));
  }
}


/**
 * Finds a mention trigger ("@" or "#") starting the token at the caret;
 * the trigger must begin the text or follow whitespace.
 * @param text Full textarea value.
 * @param caret Caret position inside the value.
 */
function detectMention(text: string, caret: number): MentionState | null {
  for (let index = caret - 1; index >= 0; index -= 1) {
    const char = text[index];
    if (/\s/.test(char)) return null;
    if (char !== '@' && char !== '#') continue;
    if (index > 0 && !/\s/.test(text[index - 1])) return null;
    return { type: char, query: text.slice(index + 1, caret), start: index };
  }
  return null;
}


/**
 * Maps an avatar path to an absolute asset URL with placeholder fallback.
 * @param path Avatar path stored on a user document.
 */
function avatarUrl(path: string): string {
  return resolveAvatarPath(path);
}
