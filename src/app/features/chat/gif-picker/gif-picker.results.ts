/**
 * @file Result shaping of the GIF picker grid: de-duplication of appended
 * offset pages and the mapping of a stored favorite back to a sendable
 * GIF result.
 */
import { GifFavorite, GifResult } from '../../../models/gif.model';
import { gifStillRendition } from '../gif-rendition';


/**
 * Drops later duplicates of the same Giphy id (offset pages of a shifting
 * feed can overlap), keeping the first occurrence's position.
 * @param gifs Accumulated results including a freshly appended page.
 */
export function dedupeById(gifs: readonly GifResult[]): GifResult[] {
  const byId = new Map(gifs.map(gif => [gif.id, gif]));
  return [...byId.values()];
}


/**
 * Maps a stored favorite back to a sendable GIF result; the still frames
 * derive from Giphy's sibling renditions.
 * @param favorite Stored favorite entry.
 */
export function favoriteToResult(favorite: GifFavorite): GifResult {
  return {
    id: favorite.id,
    url: favorite.url,
    still: gifStillRendition(favorite.url) ?? favorite.url,
    preview: favorite.previewUrl,
    previewStill: gifStillRendition(favorite.previewUrl) ?? favorite.previewUrl,
    width: favorite.width,
    height: favorite.height,
    alt: favorite.title,
  };
}
