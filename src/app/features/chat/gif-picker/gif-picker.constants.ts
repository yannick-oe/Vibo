/**
 * @file Chip model of the GIF picker's category navigation: the fixed
 * category terms, the ids and labels of the two leading chips („Favoriten"
 * and „Angesagt") and the builders resolving the visible chip bar and a
 * chip's feed term.
 */

/** Category terms of the picker chips in display order. */
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

/** Chip id of the „Favoriten" chip (hidden for the shared guest account). */
export const FAVORITES_CHIP_ID = 'favorites';

/** Chip id of the „Angesagt" (trending) chip. */
export const TRENDING_CHIP_ID = 'trending';

const FAVORITES_LABEL = 'Favoriten';

const TRENDING_LABEL = 'Angesagt';

/** One selectable chip of the picker's category bar. */
export interface GifChip {
  /** Stable chip id: a leading chip id or the category's search term. */
  readonly id: string;
  /** Visible German label (the category terms label themselves). */
  readonly label: string;
}


/**
 * The chip bar in display order: „Favoriten" (signed-in users only),
 * „Angesagt", then the category terms.
 * @param isGuest Whether the shared guest account is signed in.
 */
export function buildChips(isGuest: boolean): readonly GifChip[] {
  const categories = GIF_CATEGORY_TERMS.map(term => ({ id: term, label: term }));
  const base = [{ id: TRENDING_CHIP_ID, label: TRENDING_LABEL }, ...categories];
  return isGuest ? base : [{ id: FAVORITES_CHIP_ID, label: FAVORITES_LABEL }, ...base];
}


/**
 * The feed term a chip stands for: null for the trending feed, otherwise
 * the chip's category term.
 * @param chipId Id of the chip.
 */
export function chipTerm(chipId: string): string | null {
  return chipId === TRENDING_CHIP_ID ? null : chipId;
}
