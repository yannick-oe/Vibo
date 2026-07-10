/**
 * @file Pure helper that tokenizes message text into renderable segments:
 * @mentions, plain text and emoji. Emoji are detected by the Unicode RGI emoji
 * set — plain, skin-tone, ZWJ, flag and keycap sequences alike — and resolved
 * to the self-hosted Twemoji SVG; only actual emoji carry an asset, so plain
 * text is never turned into an image. A missing asset degrades to the native
 * glyph via the image alt (the emoji character), never a broken icon.
 */
import { emojiAsset } from './emoji-catalog';
import { parseMentions } from './mention-parser';

/**
 * One renderable run of a message bubble. An emoji segment carries a non-null
 * asset and its character as the name; mention and plain-text segments leave
 * both null.
 */
export interface MessageSegment {
  readonly text: string;
  readonly isMention: boolean;
  readonly asset: string | null;
  readonly name: string | null;
}

const EMOJI_PATTERN = /\p{RGI_Emoji}/gv;


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
 * Splits a plain-text run into alternating text and emoji segments, matching
 * every RGI emoji sequence and leaving the rest as plain text.
 * @param text Plain-text run without mentions.
 */
function splitEmoji(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(EMOJI_PATTERN)) {
    const at = match.index ?? cursor;
    if (at > cursor) segments.push(textSegment(text.slice(cursor, at)));
    segments.push(emojiSegment(match[0]));
    cursor = at + match[0].length;
  }
  if (cursor < text.length) segments.push(textSegment(text.slice(cursor)));
  return segments;
}


/**
 * Builds an emoji segment: the Twemoji asset for the character, with the
 * character itself as the alt/name so a missing asset shows the native glyph.
 * @param emoji Matched emoji character or sequence.
 */
function emojiSegment(emoji: string): MessageSegment {
  return { text: emoji, isMention: false, asset: emojiAsset(emoji), name: emoji };
}


/**
 * Builds a plain-text segment.
 * @param text Non-emoji, non-mention text run.
 */
function textSegment(text: string): MessageSegment {
  return { text, isMention: false, asset: null, name: null };
}
