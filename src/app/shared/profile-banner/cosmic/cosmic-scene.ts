/**
 * @file Cosmic scene orchestrator: resolves the theme palette, seeds the scene
 * (starfield + shooting star) and draws one frame (space base → nebula →
 * stars → aurora → shooting star). The component owns the canvas and RAF loop.
 */
import { CosmicParams } from '../../banner-options';
import { drawAurora } from './cosmic-aurora';
import { drawAuroraCurtains } from './cosmic-aurora-curtains';
import { drawNebula } from './cosmic-nebula';
import { ShootingStar, createShootingStar, stepShootingStar } from './cosmic-shooting-star';
import { Star, createStars, drawStarfield } from './cosmic-starfield';

const MAX_DT = 48;

/** Resolved colours the engine draws with (intrinsically dark in both themes). */
export interface CosmicColors {
  readonly space: string;
  readonly star: string;
  readonly primary: string;
  readonly accent: string;
  readonly auroraLow: string;
  readonly auroraMid: string;
  readonly auroraHigh: string;
  readonly auroraGlow: string;
  readonly nebulaViolet: string;
  readonly nebulaMagenta: string;
  readonly nebulaIndigo: string;
  readonly nebulaRose: string;
}

/** Mutable per-instance scene state seeded for a given size and preset. */
export interface CosmicScene {
  readonly stars: Star[];
  readonly shot: ShootingStar;
  readonly width: number;
  readonly height: number;
  readonly params: CosmicParams;
  lastTime: number;
}


/**
 * Reads the cosmic palette from the active theme tokens on the document root.
 */
export function resolveColors(): CosmicColors {
  const styles = getComputedStyle(document.documentElement);
  return { ...baseColors(styles), ...auroraColors(styles), ...nebulaColors(styles) };
}


/**
 * Reads a CSS custom property value off a computed style declaration.
 * @param styles Computed style of the document root.
 * @param name CSS custom property name.
 */
function readVar(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim();
}


/**
 * Reads the space, star and brand tokens used by the base layers and bands.
 * @param styles Computed style of the document root.
 */
function baseColors(styles: CSSStyleDeclaration): Pick<CosmicColors, 'space' | 'star' | 'primary' | 'accent'> {
  return {
    space: readVar(styles, '--banner-space'),
    star: readVar(styles, '--banner-star'),
    primary: readVar(styles, '--color-primary'),
    accent: readVar(styles, '--color-accent'),
  };
}


/**
 * Reads the decorative aurora-curtain palette (base teal → violet crown).
 * @param styles Computed style of the document root.
 */
function auroraColors(styles: CSSStyleDeclaration): Pick<CosmicColors, 'auroraLow' | 'auroraMid' | 'auroraHigh' | 'auroraGlow'> {
  return {
    auroraLow: readVar(styles, '--banner-aurora-teal'),
    auroraMid: readVar(styles, '--banner-aurora-green'),
    auroraHigh: readVar(styles, '--banner-aurora-violet'),
    auroraGlow: readVar(styles, '--banner-aurora-glow'),
  };
}


/**
 * Reads the decorative nebula bloom palette.
 * @param styles Computed style of the document root.
 */
function nebulaColors(styles: CSSStyleDeclaration): Pick<CosmicColors, 'nebulaViolet' | 'nebulaMagenta' | 'nebulaIndigo' | 'nebulaRose'> {
  return {
    nebulaViolet: readVar(styles, '--banner-nebula-violet'),
    nebulaMagenta: readVar(styles, '--banner-nebula-magenta'),
    nebulaIndigo: readVar(styles, '--banner-nebula-indigo'),
    nebulaRose: readVar(styles, '--banner-nebula-rose'),
  };
}


/**
 * Seeds a scene of the given size for a preset's params.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param params Cosmic params of the selected banner.
 */
export function createScene(width: number, height: number, params: CosmicParams): CosmicScene {
  return {
    stars: createStars(width, height, params.starDensity),
    shot: createShootingStar(),
    width,
    height,
    params,
    lastTime: 0,
  };
}


/**
 * Draws one frame of the scene; the frame delta is derived from `time` and
 * clamped so a tab-out does not jump the animation.
 * @param ctx Canvas 2D context (scaled to CSS pixels).
 * @param scene Scene state.
 * @param colors Resolved palette.
 * @param time Animation timestamp in ms.
 * @param isDimmed Whether reduced transparency tones the glow down.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  scene: CosmicScene,
  colors: CosmicColors,
  time: number,
  isDimmed: boolean,
): void {
  const dt = scene.lastTime ? Math.min(time - scene.lastTime, MAX_DT) : 0;
  scene.lastTime = time;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = colors.space;
  ctx.fillRect(0, 0, scene.width, scene.height);
  paintLayers(ctx, scene, colors, time, isDimmed, dt);
}


/**
 * Draws the layered content over the cleared base.
 * @param ctx Canvas 2D context.
 * @param scene Scene state.
 * @param colors Resolved palette.
 * @param time Animation timestamp in ms.
 * @param isDimmed Whether reduced transparency tones the glow down.
 * @param dt Clamped frame delta in ms.
 */
function paintLayers(
  ctx: CanvasRenderingContext2D,
  scene: CosmicScene,
  colors: CosmicColors,
  time: number,
  isDimmed: boolean,
  dt: number,
): void {
  const { width, height, params } = scene;
  if (params.nebulaIntensity) drawNebula(ctx, width, height, colors, params.nebulaIntensity, time, isDimmed);
  drawStarfield(ctx, scene.stars, width, colors.star, dt);
  if (params.auroraStyle === 'bands') drawAurora(ctx, width, height, colors, params.auroraIntensity, time, isDimmed);
  if (params.auroraStyle === 'curtains') drawAuroraCurtains(ctx, width, height, colors, params.auroraIntensity, time, isDimmed);
  stepShootingStar(ctx, scene.shot, width, height, colors.star, dt);
}
