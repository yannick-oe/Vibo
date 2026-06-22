/**
 * @file Selectable profile banners — mood variants of one animated cosmic
 * canvas engine, shown behind the profile picture (Discord-style). Shared by
 * the profile picker and the banner component; ids are English, labels German.
 */

/** A selectable profile banner: its English id and German display label. */
export interface BannerOption {
  readonly id: string;
  readonly label: string;
}

/** Aurora render mode: subtle horizontal bands, flowing vertical curtains, none. */
export type AuroraStyle = 'none' | 'bands' | 'curtains';

/** Mood knobs handed to the cosmic engine; each scales one scene layer. */
export interface CosmicParams {
  readonly starDensity: number;
  readonly auroraIntensity: number;
  readonly auroraStyle: AuroraStyle;
  readonly nebulaIntensity: number;
}

/** Id of the no-banner default; the model defaults to this so nobody is decorated. */
export const BANNER_NONE = 'none';

/** Fixed set of banners offered in the profile picker; "Keine" is the default. */
export const BANNER_OPTIONS: readonly BannerOption[] = [
  { id: BANNER_NONE, label: 'Keine' },
  { id: 'aurora', label: 'Polarlicht' },
  { id: 'starfield', label: 'Sternenfeld' },
  { id: 'nebula', label: 'Nebula' },
];

const NONE_PARAMS: CosmicParams = {
  starDensity: 0,
  auroraIntensity: 0,
  auroraStyle: 'none',
  nebulaIntensity: 0,
};

const COSMIC_PARAMS: Readonly<Record<string, CosmicParams>> = {
  aurora: { starDensity: 0.4, auroraIntensity: 1, auroraStyle: 'curtains', nebulaIntensity: 0 },
  starfield: { starDensity: 1.5, auroraIntensity: 0.35, auroraStyle: 'bands', nebulaIntensity: 0 },
  nebula: { starDensity: 0.9, auroraIntensity: 0, auroraStyle: 'none', nebulaIntensity: 1 },
};

/**
 * Resolves the cosmic engine params for a banner id; unknown/none ids map to
 * an empty scene so the component degrades gracefully.
 * @param id Banner id from the registry.
 */
export function cosmicParams(id: string): CosmicParams {
  return COSMIC_PARAMS[id] ?? NONE_PARAMS;
}
