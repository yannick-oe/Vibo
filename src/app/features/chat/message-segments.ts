/**
 * @file Pure helper that tokenizes message text into renderable segments:
 * @mentions, plain text and catalog emoji. Emoji are matched against the
 * unicode catalog so they render as the shared Twemoji SVG set inline with
 * the surrounding text; unknown characters stay plain text.
 */
import { EMOJI_SET, emojiAsset, emojiName } from './emoji-catalog';
import { parseMentions } from './mention-parser';

/**
 * One renderable run of a message bubble. An emoji segment carries a non-null
 * asset and name; mention and plain-text segments leave both null.
 */
export interface MessageSegment {
  readonly text: string;
  readonly isMention: boolean;
  readonly asset: string | null;
  readonly name: string | null;
}

const EMOJI_PATTERN = buildEmojiPattern();


/**
 * Builds the alternation that matches any catalog emoji; longer sequences
 * win first so skin-tone and variation-selector emoji beat their base form.
 */
function buildEmojiPattern(): RegExp {
  const keys = [...EMOJI_SET].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(`(${keys.join('|')})`, 'g');
}


/**
 * Escapes a string for literal use inside a RegExp.
 * @param value Raw emoji character.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/**
 * Tokenizes message text into mention, text and emoji segments for rendering.
 * @param text Message text content.
 * @param names Known member display names for mention detection.
 */
export function buildMessageSegments(text: string, names: string[]): MessageSegment[] {
  return parseMentions(text, names).flatMap(part =>
    part.isMention ? [mentionSegment(part.text)] : splitEmoji(part.text),
  );
}


/**
 * Wraps a mention run as a mention segment.
 * @param text Mention text including the leading "@".
 */
function mentionSegment(text: string): MessageSegment {
  return { text, isMention: true, asset: null, name: null };
}


/**
 * Splits a plain-text run into alternating text and catalog-emoji segments.
 * @param text Plain-text run without mentions.
 */
function splitEmoji(text: string): MessageSegment[] {
  return text.split(EMOJI_PATTERN).filter(part => part.length > 0).map(toSegment);
}


/**
 * Maps a split fragment to an emoji segment when it is a catalog emoji,
 * otherwise to a plain-text segment.
 * @param part Fragment produced by the emoji split.
 */
function toSegment(part: string): MessageSegment {
  return { text: part, isMention: false, asset: emojiAsset(part), name: emojiName(part) };
}
