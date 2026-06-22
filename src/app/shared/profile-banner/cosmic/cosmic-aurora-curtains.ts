/**
 * @file Flowing aurora curtains (Polarlicht): soft, translucent vertical light
 * ribbons whose horizontal position and intensity undulate over time, blending
 * teal-green at the base into violet toward the top with blurred edges and a
 * vertical falloff. Pure canvas helpers, additive over the dark space base.
 */
import type { CosmicColors } from './cosmic-scene';

const CURTAIN_COUNT = 7;
const CURTAIN_BASE_X = [0.1, 0.24, 0.38, 0.5, 0.62, 0.76, 0.9];
const CURTAIN_AMP = [0.06, 0.08, 0.05, 0.07, 0.05, 0.08, 0.06];
const CURTAIN_FREQ = [0.00021, 0.00027, 0.00019, 0.00031, 0.00018, 0.00029, 0.00023];
const CURTAIN_PHASE = [0, 0.9, 1.8, 2.7, 3.6, 4.5, 5.4];
const CURTAIN_WIDTH = 0.34;
const CURTAIN_BLUR = 26;
const CURTAIN_ALPHA = 0.17;
const CURTAIN_DIM_ALPHA = 0.12;
const ALPHA_WOBBLE = 0.26;
const GLOBAL_SWAY_AMP = 0.05;
const GLOBAL_SWAY_FREQ = 0.00008;
const STOP_LOW = 0.14;
const STOP_MID = 0.42;
const STOP_HIGH = 0.68;
const STOP_GLOW = 0.86;


/**
 * Draws all aurora curtains for one frame; soft-edged and additive unless
 * transparency is reduced, scaled by the preset intensity.
 * @param ctx Canvas 2D context.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param colors Resolved cosmic palette.
 * @param intensity Aurora intensity from the preset.
 * @param time Animation timestamp in ms.
 * @param isDimmed Whether reduced transparency tones the glow down.
 */
export function drawAuroraCurtains(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: CosmicColors,
  intensity: number,
  time: number,
  isDimmed: boolean,
): void {
  ctx.save();
  ctx.globalCompositeOperation = isDimmed ? 'source-over' : 'screen';
  ctx.filter = `blur(${CURTAIN_BLUR}px)`;
  const alpha = (isDimmed ? CURTAIN_DIM_ALPHA : CURTAIN_ALPHA) * intensity;
  const sway = GLOBAL_SWAY_AMP * Math.sin(time * GLOBAL_SWAY_FREQ);
  for (let i = 0; i < CURTAIN_COUNT; i++) drawCurtain(ctx, width, height, i, colors, alpha, time, sway);
  ctx.restore();
}


/**
 * Fills one undulating vertical curtain with its teal→violet glow gradient; the
 * centre drifts and the opacity breathes (same sine) over a shared slow
 * horizontal sway of the whole aurora.
 * @param ctx Canvas 2D context.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param index Curtain index.
 * @param colors Resolved cosmic palette.
 * @param alpha Base curtain opacity.
 * @param time Animation timestamp in ms.
 * @param sway Shared horizontal offset as a fraction of width.
 */
function drawCurtain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  index: number,
  colors: CosmicColors,
  alpha: number,
  time: number,
  sway: number,
): void {
  const wobble = Math.sin(time * CURTAIN_FREQ[index] + CURTAIN_PHASE[index]);
  const centerX = (CURTAIN_BASE_X[index] + CURTAIN_AMP[index] * wobble + sway) * width;
  const half = (CURTAIN_WIDTH * width) / 2;
  ctx.globalAlpha = Math.max(0, alpha * (1 + ALPHA_WOBBLE * wobble));
  ctx.fillStyle = curtainGradient(ctx, height, colors);
  ctx.fillRect(centerX - half, 0, half * 2, height);
  ctx.globalAlpha = 1;
}


/**
 * Vertical gradient for a curtain: transparent base → teal → green → violet →
 * bright crown → transparent top, giving the colour blend and vertical falloff.
 * @param ctx Canvas 2D context.
 * @param height Canvas height in CSS pixels.
 * @param colors Resolved cosmic palette.
 */
function curtainGradient(ctx: CanvasRenderingContext2D, height: number, colors: CosmicColors): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, 'transparent');
  gradient.addColorStop(STOP_LOW, colors.auroraLow);
  gradient.addColorStop(STOP_MID, colors.auroraMid);
  gradient.addColorStop(STOP_HIGH, colors.auroraHigh);
  gradient.addColorStop(STOP_GLOW, colors.auroraGlow);
  gradient.addColorStop(1, 'transparent');
  return gradient;
}
