/**
 * @file Derives the Twemoji (jdecked fork) asset filename of an emoji from its
 * code points, matching the naming the asset generator writes (see
 * scripts/generate-emoji.mjs): lowercase hex joined by "-", with the FE0F
 * variation selector stripped unless the sequence is a ZWJ sequence. Kept
 * separate so both the reaction chips and the picker resolve any emoji's SVG
 * without a hard-coded catalogue.
 */

const ZWJ = 0x200d;

const VARIATION_SELECTOR_16 = 0xfe0f;


/**
 * The Twemoji SVG filename (without extension) of an emoji character.
 * @param emoji Unicode emoji character or sequence.
 */
export function twemojiFilename(emoji: string): string {
  const codePoints = [...emoji].map(char => char.codePointAt(0) ?? 0);
  const kept = codePoints.includes(ZWJ)
    ? codePoints
    : codePoints.filter(codePoint => codePoint !== VARIATION_SELECTOR_16);
  return kept.map(codePoint => codePoint.toString(16)).join('-');
}
