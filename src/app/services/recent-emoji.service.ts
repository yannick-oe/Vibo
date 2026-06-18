/**
 * @file Tracks the user's two most recently used reaction emojis.
 */
import { Injectable, signal } from '@angular/core';

const RECENT_EMOJIS_STORAGE_KEY = 'dabubble:recent-emojis';
const DEFAULT_RECENT: [string, string] = ['✅', '🙌'];

/**
 * Holds the two quick-reaction emojis shown in the hover action bar,
 * persisted in localStorage (documented trade-off: no cross-device sync).
 * Before any use the Figma defaults apply.
 */
@Injectable({ providedIn: 'root' })
export class RecentEmojiService {
  private readonly recentState = signal<[string, string]>(readStoredRecent());

  readonly recent = this.recentState.asReadonly();


  /**
   * Moves the emoji to the front of the recent pair and persists it.
   * @param emoji Emoji character that was just used for a reaction.
   */
  record(emoji: string): void {
    const remaining = this.recentState().filter(entry => entry !== emoji);
    const next: [string, string] = [emoji, remaining[0] ?? DEFAULT_RECENT[0]];
    this.recentState.set(next);
    storeRecent(next);
  }
}


/**
 * Reads the persisted recent pair; falls back to the Figma defaults when
 * storage is unavailable or holds an unexpected shape.
 */
function readStoredRecent(): [string, string] {
  try {
    return parseRecent(localStorage.getItem(RECENT_EMOJIS_STORAGE_KEY));
  } catch {
    return DEFAULT_RECENT;
  }
}


/**
 * Validates the stored JSON shape.
 * @param raw Raw localStorage value.
 */
function parseRecent(raw: string | null): [string, string] {
  const parsed: unknown = raw ? JSON.parse(raw) : null;
  if (Array.isArray(parsed) && parsed.length === 2 && parsed.every(e => typeof e === 'string')) {
    return [parsed[0], parsed[1]];
  }
  return DEFAULT_RECENT;
}


/**
 * Persists the recent pair; storage errors are ignored because the
 * feature degrades gracefully to the defaults.
 * @param recent Current recent pair.
 */
function storeRecent(recent: [string, string]): void {
  try {
    localStorage.setItem(RECENT_EMOJIS_STORAGE_KEY, JSON.stringify(recent));
  } catch {
    return;
  }
}
