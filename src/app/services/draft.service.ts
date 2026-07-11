/**
 * @file Per-conversation composer drafts. Unsent text is persisted per
 * conversation in localStorage under a namespaced key, restored when the
 * conversation is reopened and cleared on send. Kept small and best-effort:
 * storage failures (private mode, quota) degrade silently to "no draft".
 */
import { Injectable } from '@angular/core';

const DRAFT_KEY_PREFIX = 'vibo:draft:';
const DRAFT_MAX_LENGTH = 5000;

/**
 * Reads, writes and clears composer drafts keyed by a conversation key (the
 * conversation document path). One entry per conversation; values are
 * length-capped so a runaway paste cannot bloat localStorage.
 */
@Injectable({ providedIn: 'root' })
export class DraftService {
  /**
   * Returns the stored draft for a conversation, or an empty string when there
   * is none or storage is unavailable.
   * @param conversationKey Stable per-conversation key (the conversation path).
   */
  read(conversationKey: string): string {
    try {
      return localStorage.getItem(DRAFT_KEY_PREFIX + conversationKey) ?? '';
    } catch {
      return '';
    }
  }


  /**
   * Persists the draft for a conversation, capping its length; empty text
   * clears the entry so stale drafts never linger.
   * @param conversationKey Stable per-conversation key (the conversation path).
   * @param text Current composer text.
   */
  write(conversationKey: string, text: string): void {
    if (text.length === 0) return this.clear(conversationKey);
    try {
      localStorage.setItem(DRAFT_KEY_PREFIX + conversationKey, text.slice(0, DRAFT_MAX_LENGTH));
    } catch {
      return;
    }
  }


  /**
   * Removes the stored draft for a conversation (on send).
   * @param conversationKey Stable per-conversation key (the conversation path).
   */
  clear(conversationKey: string): void {
    try {
      localStorage.removeItem(DRAFT_KEY_PREFIX + conversationKey);
    } catch {
      return;
    }
  }
}
