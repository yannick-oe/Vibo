/**
 * @file Resolves an avatar path to its animated WebP renditions, when present.
 */

/** The three WebP renditions of an animated avatar (all asset paths). */
export interface AvatarMedia {
  readonly still: string;
  readonly small: string;
  readonly large: string;
}

/**
 * Path stems (basename without extension) that genuinely ship a full WebP set
 * — `<stem>_static.webp`, `<stem>_256.webp` and `<stem>_384.webp` — in
 * public/avatars/. Add a stem here only once its three files are present,
 * otherwise the rendered `<img>` would request a missing file and 404. The
 * `gast` placeholder has no set and therefore stays a JPEG.
 */
export const ANIMATED_AVATAR_STEMS: ReadonlySet<string> = new Set<string>([
  'alien',
  'astronaut',
  'dragon',
  'fox',
  'gamer-girl',
  'girl',
  'headphones',
  'raccoon',
  'sphere',
  'sprout',
]);

const STILL_SUFFIX = '_static.webp';

const SMALL_SUFFIX = '_256.webp';

const LARGE_SUFFIX = '_384.webp';


/**
 * Derives the stem (basename without extension) of an avatar path.
 * @param avatarPath Avatar asset path (e.g. "avatars/fox.jpeg").
 */
function avatarStem(avatarPath: string): string {
  const base = avatarPath.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot === -1 ? base : base.slice(0, dot);
}


/**
 * Resolves an avatar path to its WebP media set, or null when the avatar has
 * no animated set (callers then keep the original JPEG).
 * @param avatarPath Avatar asset path from the user document.
 */
export function resolveAvatarMedia(avatarPath: string): AvatarMedia | null {
  const stem = avatarStem(avatarPath);
  if (!ANIMATED_AVATAR_STEMS.has(stem)) return null;
  const dot = avatarPath.lastIndexOf('.');
  const root = dot === -1 ? avatarPath : avatarPath.slice(0, dot);
  return { still: `${root}${STILL_SUFFIX}`, small: `${root}${SMALL_SUFFIX}`, large: `${root}${LARGE_SUFFIX}` };
}
