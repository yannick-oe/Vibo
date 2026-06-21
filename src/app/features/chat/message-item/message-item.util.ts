/**
 * @file Small pure helpers for the message row: timestamp resolution and
 * formatting, the reduced-motion query, and edit-textarea helpers.
 */
import { formatDate } from '@angular/common';
import { Timestamp } from '@angular/fire/firestore';

import { ChatEntry } from '../../../models/message.model';

const TIME_FORMAT = 'HH:mm';

const EDIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Converts a Firestore timestamp to a Date; pending serverTimestamp()
 * sentinels (just-sent messages) resolve to now.
 * @param value Timestamp field value from a message document.
 */
export function resolveDate(value: ChatEntry['createdAt']): Date {
  return value instanceof Timestamp ? value.toDate() : new Date();
}


/**
 * Whether the user prefers reduced motion, so delete animations are skipped.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}


/**
 * Resolves after the given delay; awaited to let the collapse-out animation
 * play before the per-user hide is written.
 * @param ms Delay in milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}


/**
 * Formats a timestamp as the HH:mm message time in the given locale.
 * @param value Timestamp field value from a message document.
 * @param locale Active locale for time formatting.
 */
export function messageTime(value: ChatEntry['createdAt'], locale: string): string {
  return formatDate(resolveDate(value), TIME_FORMAT, locale);
}


/**
 * Formats a message's latest reply time as HH:mm; empty without replies.
 * @param entry Chat entry that may carry a lastReplyAt.
 * @param locale Active locale for time formatting.
 */
export function replyPreviewTime(entry: ChatEntry, locale: string): string {
  if (!('lastReplyAt' in entry) || !entry.lastReplyAt) return '';
  return formatDate(resolveDate(entry.lastReplyAt), TIME_FORMAT, locale);
}


/**
 * Reports whether an edit is savable: non-empty after trimming and changed
 * from the stored text (matches the composer's empty-input rule).
 * @param text Current textarea value.
 * @param original Stored message text.
 */
export function isSavableEdit(text: string, original: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed !== original;
}


/**
 * Inserts text at the textarea caret and returns the resulting value.
 * @param element Edit textarea element.
 * @param text Text to insert (e.g. a picked emoji).
 */
export function insertAtCaret(element: HTMLTextAreaElement, text: string): string {
  const start = element.selectionStart ?? element.value.length;
  element.setRangeText(text, start, element.selectionEnd ?? start, 'end');
  return element.value;
}


/**
 * Reports whether a message is still inside the 15-minute edit window.
 * @param createdAt Creation timestamp of the message.
 */
export function withinEditWindow(createdAt: ChatEntry['createdAt']): boolean {
  return Date.now() - resolveDate(createdAt).getTime() < EDIT_WINDOW_MS;
}
