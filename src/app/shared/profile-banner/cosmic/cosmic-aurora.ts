/**
 * @file Flowing aurora ribbons for the cosmic banner: sine-distorted gradient
 * bands drawn with additive (screen) compositing so they bloom over the dark
 * space, in the indigo/magenta token palette. Pure canvas helpers.
 */
import type { CosmicColors } from './cosmic-scene';

const AURORA_BANDS = 3;
const AURORA_BASE_Y = [0.32, 0.5, 0.66];
const AURORA_AMP = [0.13, 0.17, 0.1];
const AURORA_FREQ = [0.018, 0.012, 0.022];
const AURORA_PHASE_SPEED = [0.00018, 0.00012, 0.00024];
const AURORA_THICKNESS = [0.26, 0.32, 0.2];
const AURORA_ALPHA = 0.5;
const AURORA_DIM_ALPHA = 0.24;
const AURORA_STEP = 10;
const GRADIENT_MID = 0.5;


/**
 * Draws all aurora bands for one frame; additive bloom unless transparency is
 * reduced, scaled by the preset intensity.
 * @param ctx Canvas 2D context.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param colors Resolved cosmic palette.
 * @param intensity Aurora intensity from the preset.
 * @param time Animation timestamp in ms.
 * @param isDimmed Whether reduced transparency tones the glow down.
 */
export function drawAurora(
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
  const alpha = (isDimmed ? AURORA_DIM_ALPHA : AURORA_ALPHA) * intensity;
  for (let band = 0; band < AURORA_BANDS; band++) {
    drawBand(ctx, width, height, band, colors, alpha, time);
  }
  ctx.restore();
}


/**
 * Fills one wavy aurora band with its vertical glow gradient.
 * @param ctx Canvas 2D context.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param band Band index.
 * @param colors Resolved cosmic palette.
 * @param alpha Band opacity.
 * @param time Animation timestamp in ms.
 */
function drawBand(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  band: number,
  colors: CosmicColors,
  alpha: number,
  time: number,
): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = bandGradient(ctx, height, band, colors);
  ctx.beginPath();
  traceBand(ctx, width, height, band, time);
  ctx.fill();
  ctx.globalAlpha = 1;
}


/**
 * Traces a wavy band outline (top edge left→right, bottom edge right→left).
 * @param ctx Canvas 2D context.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param band Band index.
 * @param time Animation timestamp in ms.
 */
function traceBand(ctx: CanvasRenderingContext2D, width: number, height: number, band: number, time: number): void {
  ctx.moveTo(0, bandY(0, height, band, time, false));
  for (let x = AURORA_STEP; x <= width; x += AURORA_STEP) ctx.lineTo(x, bandY(x, height, band, time, false));
  for (let x = width; x >= 0; x -= AURORA_STEP) ctx.lineTo(x, bandY(x, height, band, time, true));
  ctx.closePath();
}


/**
 * Wavy y of a band edge at x; the bottom edge adds the band thickness.
 * @param x Horizontal position in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param band Band index.
 * @param time Animation timestamp in ms.
 * @param isBottom Whether this is the lower edge.
 */
function bandY(x: number, height: number, band: number, time: number, isBottom: boolean): number {
  const wave = Math.sin(x * AURORA_FREQ[band] + time * AURORA_PHASE_SPEED[band]);
  const base = height * AURORA_BASE_Y[band] + wave * height * AURORA_AMP[band];
  return isBottom ? base + height * AURORA_THICKNESS[band] : base;
}


/**
 * Vertical transparent→color→transparent gradient that makes a band glow.
 * @param ctx Canvas 2D context.
 * @param height Canvas height in CSS pixels.
 * @param band Band index.
 * @param colors Resolved cosmic palette.
 */
function bandGradient(ctx: CanvasRenderingContext2D, height: number, band: number, colors: CosmicColors): CanvasGradient {
  const top = height * (AURORA_BASE_Y[band] - AURORA_AMP[band]);
  const span = height * (AURORA_THICKNESS[band] + AURORA_AMP[band] * 2);
  const gradient = ctx.createLinearGradient(0, top, 0, top + span);
  gradient.addColorStop(0, 'transparent');
  gradient.addColorStop(GRADIENT_MID, band % 2 === 0 ? colors.primary : colors.accent);
  gradient.addColorStop(1, 'transparent');
  return gradient;
}
