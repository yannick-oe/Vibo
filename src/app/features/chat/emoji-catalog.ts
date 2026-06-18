/**
 * @file Catalog of reaction emojis: unicode characters mapped to their
 * Emojitwo SVG assets. Firestore reaction keys stay unicode characters so
 * existing reaction data keeps working — only the UI renders the SVGs.
 */

const EMOJI_ASSETS: Record<string, string> = {
  '✅': 'emojis/2705.svg',
  '🙌': 'emojis/1f64c.svg',
  '👍': 'emojis/1f44d.svg',
  '🚀': 'emojis/1f680.svg',
  '🤓': 'emojis/1f913.svg',
  '😀': 'emojis/1f600.svg',
  '😂': 'emojis/1f602.svg',
  '❤️': 'emojis/2764.svg',
  '🎉': 'emojis/1f389.svg',
  '🔥': 'emojis/1f525.svg',
  '😎': 'emojis/1f60e.svg',
  '🤔': 'emojis/1f914.svg',
  '👀': 'emojis/1f440.svg',
  '💯': 'emojis/1f4af.svg',
  '😅': 'emojis/1f605.svg',
  '🙏': 'emojis/1f64f.svg',
  '👏': 'emojis/1f44f.svg',
  '😍': 'emojis/1f60d.svg',
  '😉': 'emojis/1f609.svg',
  '😢': 'emojis/1f622.svg',
  '💡': 'emojis/1f4a1.svg',
  '⚡': 'emojis/26a1.svg',
  '👎': 'emojis/1f44e.svg',
  '🍀': 'emojis/1f340.svg',
};

/** Ordered picker set; the first two are the quick-reaction defaults. */
export const EMOJI_SET: readonly string[] = Object.keys(EMOJI_ASSETS);


/**
 * Resolves the Emojitwo asset URL of a reaction emoji; null for characters
 * outside the catalog (legacy keys render as plain text).
 * @param emoji Unicode emoji character used as the reaction key.
 */
export function emojiAsset(emoji: string): string | null {
  const asset = EMOJI_ASSETS[emoji];
  return asset ? `${asset}` : null;
}
