/**
 * @file Message composer card with growing textarea, emoji insertion,
 * mention and ":shortcode" emoji suggestions, emoticon auto-conversion
 * and send handling.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { GifResult } from '../../../models/gif.model';
import { ChannelService } from '../../../services/channel.service';
import { DraftService } from '../../../services/draft.service';
import { EmojiDataService } from '../../../services/emoji-data.service';
import { TypingService } from '../../../services/typing.service';
import { UserService } from '../../../services/user.service';
import { ComposerDraft } from '../composer-draft';
import { EmoticonTracker, convertTrailingEmoticon } from '../composer-emoticons';
import {
  MentionState,
  SuggestionKeyContext,
  buildChannelSuggestions,
  buildEmojiSuggestions,
  buildUserSuggestions,
  detectMention,
  handleSuggestionKey,
} from '../composer-mentions';
import { parseMentions } from '../mention-parser';
import {
  Suggestion,
  SuggestionDropdownComponent,
} from '../../../shared/suggestion-dropdown/suggestion-dropdown.component';
import { EmojiPickerComponent } from '../emoji-picker/emoji-picker.component';
import { GifPickerComponent } from '../gif-picker/gif-picker.component';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import { anchorAbove } from '../../../shared/dialog-shell/dialog-anchor';

const MAX_TEXTAREA_HEIGHT_PX = 200;

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
  imports: [EmojiPickerComponent, GifPickerComponent, SuggestionDropdownComponent, DialogShellComponent],
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

  private readonly draft = new ComposerDraft(inject(DraftService));

  private readonly emojiData = inject(EmojiDataService);

  private readonly emoticons = new EmoticonTracker();

  private readonly typingService = inject(TypingService);

  private readonly textarea = viewChild.required<ElementRef<HTMLTextAreaElement>>('textarea');

  private readonly backdrop = viewChild<ElementRef<HTMLDivElement>>('backdrop');

  private readonly smileButton = viewChild.required<ElementRef<HTMLButtonElement>>('smileBtn');

  protected readonly inputId = `composer-text-${MessageInputComponent.instanceCounter++}`;

  protected readonly suggestionIdPrefix = `${this.inputId}-suggestion`;

  protected readonly emojiTitleId = `${this.inputId}-emoji-title`;

  protected readonly text = signal('');

  protected readonly pickerOpen = signal(false);

  protected readonly pickerAnchor = computed(() =>
    this.pickerOpen() ? anchorAbove(this.smileButton().nativeElement, 'left') : null,
  );

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
   * Restores the persisted draft whenever the bound conversation changes, so
   * reopening a chat brings back its unsent text and switching conversations
   * never flashes the previous one's draft.
   */
  constructor() {
    effect(() => this.loadDraft(this.conversationPath()));
  }


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
    this.emoticons.trackInput();
    this.text.set(element.value);
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
    this.syncMention(element);
    this.signalTyping();
    this.draft.save(this.conversationPath(), this.text());
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
   * Handles composer keys: emoticon conversion/revert first, suggestion
   * navigation while a dropdown is open, Escape cancels an open reply
   * context, otherwise Enter sends (Shift+Enter falls through).
   * @param event Keydown event of the textarea.
   */
  protected onKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    if (this.handleEmoticonKey(event)) return;
    if (this.mention() !== null && handleSuggestionKey(event, this.suggestionKeys)) return;
    if (event.key === 'Escape' && this.replyContext()) return this.cancelReply.emit();
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }


  /**
   * Space converts an emoticon ending at the caret (the keystroke itself
   * proceeds and inserts the space); Backspace right after a conversion
   * restores the literal emoticon and is consumed, with the signal, the
   * open-mention state and the draft re-synced by hand because the
   * programmatic edit fires no input event.
   * @param event Keydown event of the textarea.
   * @returns True when the key was consumed (only the Backspace revert).
   */
  private handleEmoticonKey(event: KeyboardEvent): boolean {
    const element = this.textarea().nativeElement;
    if (event.key === ' ') this.emoticons.convertBeforeSpace(element);
    if (event.key !== 'Backspace' || !this.emoticons.revertOnBackspace(element)) return false;
    event.preventDefault();
    this.text.set(element.value);
    this.syncMention(element);
    this.draft.save(this.conversationPath(), element.value);
    return true;
  }


  /**
   * Inserts a picked emoji at the caret and returns focus to the field.
   * @param emoji Picked emoji character.
   */
  protected insertEmoji(emoji: string): void {
    const element = this.textarea().nativeElement;
    const start = element.selectionStart ?? element.value.length;
    element.setRangeText(emoji, start, element.selectionEnd ?? start, 'end');
    this.text.set(element.value);
    this.closePicker();
  }


  /**
   * Closes the emoji picker and returns focus to the composer input after the
   * overlay has run its own focus restoration (hence the deferred focus).
   */
  protected closePicker(): void {
    this.pickerOpen.set(false);
    requestAnimationFrame(() => this.focusInput());
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
   * Replaces the open token with the picked suggestion — mentions as plain
   * text ("@Name " / "#channelname "), emoji shortcodes as the Unicode
   * character itself — and closes the dropdown.
   * @param suggestion Picked suggestion row.
   */
  protected pickSuggestion(suggestion: Suggestion): void {
    const mention = this.mention();
    if (!mention) return;
    const element = this.textarea().nativeElement;
    const caret = element.selectionStart ?? element.value.length;
    const insertion = mention.type === ':' ? suggestion.id : `${mention.type}${suggestion.label} `;
    element.setRangeText(insertion, mention.start, caret, 'end');
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
    this.send.emit(convertTrailingEmoticon(this.text().trim()));
    this.stopTyping();
    this.draft.clear(this.conversationPath());
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
   * Loads the persisted draft for the bound conversation into the composer;
   * conversationless composers (thread, new message) keep their own state.
   * @param path Conversation document path, or null.
   */
  private loadDraft(path: string | null): void {
    if (!path) return;
    const value = this.draft.read(path);
    this.text.set(value);
    this.mention.set(null);
    requestAnimationFrame(() =>
      this.draft.restoreIntoDom(this.textarea().nativeElement, value, MAX_TEXTAREA_HEIGHT_PX),
    );
  }


  /** Composer accessors handed to the shared dropdown keyboard handling. */
  private readonly suggestionKeys: SuggestionKeyContext = {
    count: () => this.suggestions().length,
    activeIndex: () => this.activeIndex(),
    setActiveIndex: index => this.activeIndex.set(index),
    pickActive: () => this.pickSuggestion(this.suggestions()[this.activeIndex()]),
    close: () => this.mention.set(null),
  };


  /**
   * Detects an open mention/shortcode token at the caret and resets the
   * selection; a ":" token lazily loads the emoji catalogue.
   * @param element Composer textarea.
   */
  private syncMention(element: HTMLTextAreaElement): void {
    const caret = element.selectionStart ?? element.value.length;
    const mention = detectMention(element.value, caret);
    if (mention?.type === ':') this.emojiData.load();
    this.mention.set(mention);
    this.activeIndex.set(0);
  }


  /**
   * Builds the suggestion rows for the open token type via the pure
   * helpers, filtered live by the typed query.
   */
  private buildSuggestions(): Suggestion[] {
    const mention = this.mention();
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    if (mention.type === '#') return buildChannelSuggestions(this.channelService.channels(), query);
    if (mention.type === ':') return buildEmojiSuggestions(this.emojiData.search(query));
    return buildUserSuggestions(this.userService.users(), query);
  }
}
