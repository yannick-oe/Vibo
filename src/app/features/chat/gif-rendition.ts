/**
 * @file Derives the lightweight fixed-width WebP rendition of a stored Giphy
 * GIF. Messages persist the fixed_height GIF URL (e.g. …/media/{id}/200.gif);
 * Giphy serves every rendition of the same media under sibling filenames, so
 * swapping the final path segment for 200w.webp yields the ~200px-wide WebP
 * — measured at a fraction of the stored GIF's bytes (−23% to −85% across
 * samples) with the identical aspect ratio, so the reserved bubble box
 * (explicit width/height attributes) stays exact and CLS stays 0. Rendering
 * falls back to the stored GIF URL onerror.
 */

const GIF_EXTENSION = '.gif';

const GIF_MESSAGE_RENDITION = '200w.webp';

const GIF_STILL_SUFFIX = '_s';

/**
 * Rewrites a Giphy GIF rendition URL to the fixed-width WebP rendition by
 * replacing the final path segment (the tracking query is dropped — Giphy
 * media paths resolve without it). Null when the URL is not a rewritable
 * https GIF resource — callers then keep the stored URL.
 * @param url Stored Giphy rendition URL (e.g. …/media/{id}/200.gif?cid=…).
 */
export function gifWebpRendition(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.pathname.endsWith(GIF_EXTENSION)) return null;
    const base = parsed.pathname.slice(0, parsed.pathname.lastIndexOf('/') + 1);
    return `${parsed.origin}${base}${GIF_MESSAGE_RENDITION}`;
  } catch {
    return null;
  }
}


/**
 * Derives the still-frame sibling of a Giphy GIF rendition URL by suffixing
 * the final path segment's name (Giphy serves e.g. 200.gif alongside
 * 200_s.gif). Null when the URL is not a rewritable https GIF resource —
 * callers then keep the animated URL.
 * @param url Stored Giphy rendition URL (e.g. …/media/{id}/200.gif).
 */
export function gifStillRendition(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.pathname.endsWith(GIF_EXTENSION)) return null;
    const stem = parsed.pathname.slice(0, -GIF_EXTENSION.length);
    return `${parsed.origin}${stem}${GIF_STILL_SUFFIX}${GIF_EXTENSION}`;
  } catch {
    return null;
  }
}
