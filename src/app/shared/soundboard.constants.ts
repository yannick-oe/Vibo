/**
 * @file Shared constants of the voice-channel soundboard: the curated
 * preset list (id, German-facing display name, asset path) and the shared
 * press/receive throttle interval. Presets are loudness-normalized MP3
 * files under public/sounds/soundboard/ (produced by
 * tools/transcode-soundboard.mjs from the Pixabay sources in
 * tools/assets-src/soundboard/); broadcasts carry only the preset id
 * through the existing 'sound' signaling envelopes, and ids that resolve
 * to no preset are ignored silently on the receiving side.
 */

/** Base path of the shipped preset files (relative for subfolder deploys). */
export const SOUNDBOARD_ASSET_BASE = 'sounds/soundboard/';

/** Minimum interval between two soundboard presses in milliseconds. */
export const SOUNDBOARD_THROTTLE_MS = 2000;

/** One curated soundboard preset. */
export interface SoundboardPreset {
  /** Stable id carried in the signaling envelope (≤ 32 chars, rules cap). */
  readonly id: string;
  /** Visible display name of the soundboard button. */
  readonly label: string;
  /** App-relative path of the preset's MP3 file. */
  readonly assetPath: string;
}


/**
 * Builds one preset entry with its conventional asset path (the id doubles
 * as the kebab-case file name).
 * @param id Stable preset id.
 * @param label Visible display name.
 */
function preset(id: string, label: string): SoundboardPreset {
  return { id, label, assetPath: `${SOUNDBOARD_ASSET_BASE}${id}.mp3` };
}


/** The curated soundboard presets in display order. */
export const SOUNDBOARD_PRESETS: readonly SoundboardPreset[] = [
  preset('woah', 'Woah'),
  preset('what', 'What'),
  preset('wait-a-minute', 'Wait a minute'),
  preset('nein-doch', 'Nein doch'),
  preset('i-got-this', 'I got this'),
  preset('horn', 'Horn'),
  preset('hehe-boi', 'Hehe Boi'),
  preset('fart', 'Fart'),
  preset('evil-laugh', 'Evil Laugh'),
  preset('drumroll', 'Drumroll'),
];


/**
 * Resolves a soundboard preset by its broadcast id.
 * @param soundId Id carried in a 'sound' signaling envelope.
 * @returns The preset, or null for unknown ids (ignored silently).
 */
export function soundboardPresetById(soundId: string): SoundboardPreset | null {
  return SOUNDBOARD_PRESETS.find(entry => entry.id === soundId) ?? null;
}
