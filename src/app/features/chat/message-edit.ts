/**
 * @file Edit-mode state and actions for a message row, extracted from the item
 * component: the editing / text / picker signals plus start/cancel/save/insert
 * logic. Held as a plain field on the message item; DOM and Firestore access
 * come in via the constructor accessors so the component stays thin.
 */
import { signal } from '@angular/core';

import { ChatEntry } from '../../models/message.model';
import { MessageService } from '../../services/message.service';
import { ToastService } from '../../services/toast.service';
import {
  insertAtCaret,
  isSavableEdit,
  prefersReducedMotion,
  runMessageAction,
} from './message-item/message-item.util';

const EDIT_CONTAINER_SELECTOR = '.message__edit';

/**
 * Per-row edit controller: owns the edit signals and the save / cancel / emoji
 * flow, coordinating the edit textarea and the message service.
 */
export class MessageEdit {
  readonly active = signal(false);

  readonly text = signal('');

  readonly pickerOpen = signal(false);


  /**
   * @param messages Message service for persisting the edit.
   * @param toast Toast service for surfacing a failed save.
   * @param entry Accessor for the current chat entry.
   * @param path Accessor for the message document path, or null.
   * @param textarea Accessor for the edit textarea element.
   */
  constructor(
    private readonly messages: MessageService,
    private readonly toast: ToastService,
    private readonly entry: () => ChatEntry,
    private readonly path: () => string | null,
    private readonly textarea: () => HTMLTextAreaElement | undefined,
  ) {}


  /**
   * Enters edit mode with the current text, then focuses the field and reveals
   * the edit UI once it has mounted.
   */
  start(): void {
    this.text.set(this.entry().text);
    this.active.set(true);
    requestAnimationFrame(() => this.focusAndReveal());
  }


  /**
   * Focuses the edit field without its default scroll, then scrolls the whole
   * edit container (buttons included) just into view — `block: 'nearest'` so a
   * message already fully visible never jumps. Instant under reduced motion.
   */
  private focusAndReveal(): void {
    const element = this.textarea();
    if (!element) return;
    element.focus({ preventScroll: true });
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    element.closest(EDIT_CONTAINER_SELECTOR)?.scrollIntoView({ block: 'nearest', behavior });
  }


  /**
   * Leaves edit mode, closing the emoji picker.
   */
  cancel(): void {
    this.active.set(false);
    this.pickerOpen.set(false);
  }


  /**
   * Syncs the edit signal with the textarea.
   * @param event Input event of the edit textarea.
   */
  onInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }


  /**
   * Reports whether the edited text is non-empty and actually changed.
   */
  canSave(): boolean {
    return isSavableEdit(this.text(), this.entry().text);
  }


  /**
   * Persists the edit and stamps editedAt; stays in edit mode on a failed write
   * so the draft is not lost (the failure surfaces as a toast).
   */
  async save(): Promise<void> {
    const path = this.path();
    if (!path || !this.canSave()) return;
    const saved = await runMessageAction(this.toast, () => this.messages.editMessage(path, this.text().trim()));
    if (saved) this.cancel();
  }


  /**
   * Handles edit-textarea keys: Enter saves (Shift+Enter inserts a newline),
   * Escape cancels.
   * @param event Keydown event of the edit textarea.
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') return this.cancel();
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void this.save();
  }


  /**
   * Inserts a picked emoji at the caret, closes the picker and returns focus to
   * the edit field.
   * @param emoji Picked emoji character.
   */
  insertEmoji(emoji: string): void {
    this.pickerOpen.set(false);
    const element = this.textarea();
    if (!element) return;
    this.text.set(insertAtCaret(element, emoji));
    requestAnimationFrame(() => element.focus());
  }
}
