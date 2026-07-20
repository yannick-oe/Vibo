/**
 * @file Pure helpers for the composer's suggestion dropdown: detecting an
 * open "@"/"#"/":" token at the caret, building the member/channel/emoji
 * suggestion rows and the arrow-key index math. Kept free of component
 * state so the composer stays thin (and under the file-size budget).
 */
import { Channel } from '../../models/channel.model';
import { UserDoc } from '../../models/user.model';
import { EmojiEntry } from '../../services/emoji-data.service';
import { resolveAvatarStillSrc } from '../../services/registration.service';
import { Suggestion } from '../../shared/suggestion-dropdown/suggestion-dropdown.component';

/** Maximum number of rows in the ":shortcode" emoji dropdown. */
export const EMOJI_SUGGESTION_LIMIT = 8;

/** Minimum query length before the ":shortcode" dropdown opens. */
export const EMOJI_TRIGGER_MIN_QUERY = 2;

/** Open mention/shortcode context inside the composer textarea. */
export interface MentionState {
  readonly type: '@' | '#' | ':';
  readonly query: string;
  readonly start: number;
}

/**
 * Finds a trigger ("@" or "#" for mentions, ":" for emoji shortcodes)
 * starting the token at the caret. Every trigger must begin the text or
 * follow whitespace — a ":" inside a word, a time ("12:30") or a URL
 * ("https://…") never opens the dropdown; the ":" additionally requires
 * {@link EMOJI_TRIGGER_MIN_QUERY} typed characters.
 * @param text Full textarea value.
 * @param caret Caret position inside the value.
 */
export function detectMention(text: string, caret: number): MentionState | null {
  for (let index = caret - 1; index >= 0; index -= 1) {
    const char = text[index];
    if (/\s/.test(char)) return null;
    if (char !== '@' && char !== '#' && char !== ':') continue;
    if (index > 0 && !/\s/.test(text[index - 1])) return null;
    const query = text.slice(index + 1, caret);
    if (char === ':' && query.length < EMOJI_TRIGGER_MIN_QUERY) return null;
    return { type: char, query, start: index };
  }
  return null;
}

/**
 * Builds the "#" channel suggestions matching the typed query.
 * @param channels Known channels.
 * @param query Lowercased text typed after the trigger.
 */
export function buildChannelSuggestions(channels: Channel[], query: string): Suggestion[] {
  return channels
    .filter(channel => channel.name.toLowerCase().includes(query))
    .map(channel => ({ id: channel.id, label: channel.name, isHash: true }));
}

/**
 * Builds the "@" member suggestions; each row carries its uid so the shared
 * presence dot resolves the live state itself.
 * @param users Known users.
 * @param query Lowercased text typed after the trigger.
 */
export function buildUserSuggestions(users: UserDoc[], query: string): Suggestion[] {
  return users
    .filter(user => user.name.toLowerCase().includes(query))
    .map(user => ({
      id: user.uid,
      label: user.name,
      avatar: resolveAvatarStillSrc(user.avatarPath),
      presenceUid: user.uid,
    }));
}

/**
 * Builds the ":" emoji suggestions from a catalogue search result: the
 * Unicode character rides as the row id (it IS the insertion), the German
 * name as the label and the Twemoji SVG as the row icon.
 * @param entries Catalogue entries matching the typed query.
 */
export function buildEmojiSuggestions(entries: EmojiEntry[]): Suggestion[] {
  return entries.slice(0, EMOJI_SUGGESTION_LIMIT).map(entry => ({
    id: entry.u,
    label: entry.n,
    emojiSrc: `emojis/${entry.f}.svg`,
  }));
}

/**
 * Next active suggestion index for an arrow key, wrapping around the list.
 * @param key Keydown key ("ArrowDown" or "ArrowUp").
 * @param current Current active index.
 * @param count Number of suggestions.
 */
export function nextActiveIndex(key: string, current: number, count: number): number {
  const delta = key === 'ArrowDown' ? 1 : -1;
  return (current + delta + count) % Math.max(count, 1);
}

/** Accessors the dropdown keyboard handling reaches the composer through. */
export interface SuggestionKeyContext {
  /** Number of currently visible suggestion rows. */
  readonly count: () => number;
  /** Currently active row index. */
  readonly activeIndex: () => number;
  /** Moves the active row. */
  readonly setActiveIndex: (index: number) => void;
  /** Picks the active row (Enter). */
  readonly pickActive: () => void;
  /** Closes the dropdown (Escape). */
  readonly close: () => void;
}


/**
 * Handles a keydown while a suggestion dropdown is open: arrow navigation
 * with wrap-around, Enter picks the active row, Escape closes.
 * @param event Keydown event of the composer textarea.
 * @param context Composer accessors.
 * @returns True when the key was consumed by the dropdown.
 */
export function handleSuggestionKey(event: KeyboardEvent, context: SuggestionKeyContext): boolean {
  if (consumeArrowKey(event, context)) return true;
  if (event.key === 'Enter' && context.count() > 0) {
    event.preventDefault();
    context.pickActive();
    return true;
  }
  if (event.key !== 'Escape') return false;
  event.stopPropagation();
  context.close();
  return true;
}


/**
 * Moves the active suggestion with the arrow keys, wrapping around.
 * @param event Keydown event of the composer textarea.
 * @param context Composer accessors.
 * @returns True when an arrow key was handled.
 */
function consumeArrowKey(event: KeyboardEvent, context: SuggestionKeyContext): boolean {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false;
  event.preventDefault();
  context.setActiveIndex(nextActiveIndex(event.key, context.activeIndex(), context.count()));
  return true;
}
