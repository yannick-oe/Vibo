/**
 * @file Catalog of reaction emojis: unicode characters mapped to their
 * Twemoji (jdecked fork) SVG assets and an accessible German name. Firestore
 * reaction keys stay unicode characters, so existing reaction data keeps
 * working and the artwork set can change without a data migration — only the
 * UI resolves the SVGs and labels.
 */
import { bigReactionEffect, bigReactionLabel } from '../../models/reactions';

/** Rendering metadata of one catalog emoji: SVG asset path and a11y name. */
interface EmojiMeta {
  readonly asset: string;
  readonly name: string;
}

const EMOJI_CATALOG: Record<string, EmojiMeta> = {
  '✅': { asset: 'emojis/2705.svg', name: 'Häkchen' },
  '🙌': { asset: 'emojis/1f64c.svg', name: 'Jubelnde Hände' },
  '👍': { asset: 'emojis/1f44d.svg', name: 'Daumen hoch' },
  '🚀': { asset: 'emojis/1f680.svg', name: 'Rakete' },
  '🤓': { asset: 'emojis/1f913.svg', name: 'Nerd-Gesicht' },
  '😀': { asset: 'emojis/1f600.svg', name: 'Lachendes Gesicht' },
  '😂': { asset: 'emojis/1f602.svg', name: 'Tränen lachend' },
  '❤️': { asset: 'emojis/2764.svg', name: 'Rotes Herz' },
  '🎉': { asset: 'emojis/1f389.svg', name: 'Party-Tröte' },
  '🔥': { asset: 'emojis/1f525.svg', name: 'Feuer' },
  '😎': { asset: 'emojis/1f60e.svg', name: 'Cooles Gesicht' },
  '🤔': { asset: 'emojis/1f914.svg', name: 'Nachdenkliches Gesicht' },
  '👀': { asset: 'emojis/1f440.svg', name: 'Augen' },
  '💯': { asset: 'emojis/1f4af.svg', name: 'Hundert Punkte' },
  '😅': { asset: 'emojis/1f605.svg', name: 'Lächeln mit Schweiß' },
  '🙏': { asset: 'emojis/1f64f.svg', name: 'Betende Hände' },
  '👏': { asset: 'emojis/1f44f.svg', name: 'Klatschende Hände' },
  '😍': { asset: 'emojis/1f60d.svg', name: 'Verliebtes Gesicht' },
  '😉': { asset: 'emojis/1f609.svg', name: 'Zwinkerndes Gesicht' },
  '😢': { asset: 'emojis/1f622.svg', name: 'Weinendes Gesicht' },
  '💡': { asset: 'emojis/1f4a1.svg', name: 'Glühbirne' },
  '⚡': { asset: 'emojis/26a1.svg', name: 'Blitz' },
  '👎': { asset: 'emojis/1f44e.svg', name: 'Daumen runter' },
  '🍀': { asset: 'emojis/1f340.svg', name: 'Glücksklee' },
  '🫡': { asset: 'emojis/1fae1.svg', name: 'Salutierendes Gesicht' },
  '👍🏽': { asset: 'emojis/1f44d-1f3fd.svg', name: 'Daumen hoch, mittlerer Hautton' },
  '💖': { asset: 'emojis/1f496.svg', name: 'Funkelndes Herz' },
};

/** Ordered full catalog: the composer insert grid and the source GRID_EMOJI_SET filters. */
export const EMOJI_SET: readonly string[] = Object.keys(EMOJI_CATALOG);

/** Main picker grid in reaction context: the catalog minus the big reactions. */
export const GRID_EMOJI_SET: readonly string[] = EMOJI_SET.filter(
  emoji => bigReactionEffect(emoji) === null,
);


/**
 * Resolves the Twemoji asset URL of a reaction emoji; null for characters
 * outside the catalog (legacy keys render as plain text).
 * @param emoji Unicode emoji character used as the reaction key.
 */
export function emojiAsset(emoji: string): string | null {
  return EMOJI_CATALOG[emoji]?.asset ?? null;
}


/**
 * Resolves the accessible German name of a catalog emoji; null for
 * characters outside the catalog.
 * @param emoji Unicode emoji character.
 */
export function emojiName(emoji: string): string | null {
  return EMOJI_CATALOG[emoji]?.name ?? null;
}


/**
 * Accessible label of a reaction trigger button ("Mit … reagieren"); big
 * reactions use their effect noun ("Konfetti"/"Herzen"/"Rakete"), all others
 * the catalog name, with the raw character as a legacy fallback.
 * @param emoji Reaction emoji character.
 */
export function reactionTriggerLabel(emoji: string): string {
  return `Mit ${bigReactionLabel(emoji) ?? emojiName(emoji) ?? emoji} reagieren`;
}
