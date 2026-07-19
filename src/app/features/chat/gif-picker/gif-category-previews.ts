/**
 * @file Category start view of the GIF picker: the fixed category terms and
 * the two-layer cache of their representative tile previews (module memory
 * for the session, localStorage under the vibo: namespace with a 24 h TTL
 * across sessions). Within the TTL, opening the start view costs zero
 * Giphy requests; storage failures degrade to the in-memory layer only.
 */

/** Category terms of the start-view tiles in display order. */
export const GIF_CATEGORY_TERMS: readonly string[] = [
  'lmao',
  'uff',
  'sure',
  'bruh',
  'facepalm',
  'yikes',
  'wow',
  'gg',
  'nope',
  'vibes',
];

/** localStorage key of the persisted category-preview cache. */
export const CATEGORY_PREVIEWS_STORAGE_KEY = 'vibo:gifCategoryPreviews';

const HOURS_PER_DAY = 24;

const MS_PER_HOUR = 3_600_000;

/** Lifetime of the persisted category-preview cache. */
export const CATEGORY_PREVIEWS_TTL_MS = HOURS_PER_DAY * MS_PER_HOUR;

/** Representative tile preview of one category term. */
export interface CategoryPreview {
  /** Small animated preview URL (fixed_height_small rendition). */
  readonly url: string;
  /** Still frame of the preview for prefers-reduced-motion. */
  readonly still: string;
}

/** Persisted shape of the category-preview cache. */
interface StoredPreviews {
  readonly savedAt: number;
  readonly previews: Record<string, CategoryPreview>;
}

let memoryCache: Record<string, CategoryPreview> | null = null;


/**
 * Reads the cached category previews: the in-memory layer first, then a
 * localStorage entry still inside its TTL. Null when nothing valid is
 * cached.
 */
export function readCachedPreviews(): Record<string, CategoryPreview> | null {
  if (memoryCache) return memoryCache;
  const stored = readStoredPreviews();
  if (stored) memoryCache = stored;
  return stored;
}


/**
 * Caches a complete category-preview map in memory and localStorage
 * (storage failures are ignored — the memory layer still serves the
 * session).
 * @param previews Preview per category term.
 */
export function storeCachedPreviews(previews: Record<string, CategoryPreview>): void {
  memoryCache = previews;
  const entry: StoredPreviews = { savedAt: Date.now(), previews };
  try {
    localStorage.setItem(CATEGORY_PREVIEWS_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    return;
  }
}


/**
 * Reads and validates the localStorage layer; null on a missing, malformed
 * or expired entry.
 */
function readStoredPreviews(): Record<string, CategoryPreview> | null {
  try {
    const raw = localStorage.getItem(CATEGORY_PREVIEWS_STORAGE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as StoredPreviews;
    if (Date.now() - entry.savedAt > CATEGORY_PREVIEWS_TTL_MS) return null;
    return entry.previews ?? null;
  } catch {
    return null;
  }
}
