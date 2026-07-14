/**
 * @file Pure helpers for the composer's mention dropdown: detecting an open
 * "@"/"#" token at the caret, building the member/channel suggestion rows and
 * the arrow-key index math. Kept free of component state so the composer stays
 * thin (and under the file-size budget).
 */
import { Channel } from '../../models/channel.model';
import { UserDoc } from '../../models/user.model';
import { resolveAvatarPath } from '../../services/registration.service';
import { Suggestion } from '../../shared/suggestion-dropdown/suggestion-dropdown.component';

/** Open mention context inside the composer textarea. */
export interface MentionState {
  readonly type: '@' | '#';
  readonly query: string;
  readonly start: number;
}

/**
 * Finds a mention trigger ("@" or "#") starting the token at the caret; the
 * trigger must begin the text or follow whitespace.
 * @param text Full textarea value.
 * @param caret Caret position inside the value.
 */
export function detectMention(text: string, caret: number): MentionState | null {
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
      avatar: resolveAvatarPath(user.avatarPath),
      presenceUid: user.uid,
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
