/**
 * @file Colored nebula clouds for the cosmic banner: a few large soft radial
 * blobs that sway and bloom additively in the token palette. Pure canvas
 * helpers, used only by the nebula-forward preset.
 */
import type { CosmicColors } from './cosmic-scene';

/** One nebula blob: centre/size as fractions of the canvas plus a sway speed. */
interface NebulaBlob {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly sway: number;
  readonly isAccent: boolean;
}

const NEBULA_BLOBS: readonly NebulaBlob[] = [
  { cx: 0.26, cy: 0.34, radius: 0.5, sway: 0.00004, isAccent: false },
  { cx: 0.72, cy: 0.54, radius: 0.55, sway: -0.00003, isAccent: true },
  { cx: 0.5, cy: 0.72, radius: 0.42, sway: 0.00005, isAccent: false },
];
const NEBULA_ALPHA = 0.42;
const NEBULA_DIM_ALPHA = 0.2;
const NEBULA_SWAY_AMP = 0.05;


/**
 * Draws the nebula clouds for one frame (additive unless dimmed).
 * @param ctx Canvas 2D context.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param colors Resolved cosmic palette.
 * @param intensity Nebula intensity from the preset.
 * @param time Animation timestamp in ms.
 * @param isDimmed Whether reduced transparency tones the glow down.
 */
export function drawNebula(
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
  const alpha = (isDimmed ? NEBULA_DIM_ALPHA : NEBULA_ALPHA) * intensity;
  for (const blob of NEBULA_BLOBS) drawBlob(ctx, width, height, blob, colors, alpha, time);
  ctx.restore();
}


/**
 * Fills the canvas with one swaying radial nebula blob.
 * @param ctx Canvas 2D context.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param blob Blob definition.
 * @param colors Resolved cosmic palette.
 * @param alpha Blob opacity.
 * @param time Animation timestamp in ms.
 */
function drawBlob(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  blob: NebulaBlob,
  colors: CosmicColors,
  alpha: number,
  time: number,
): void {
  const cx = (blob.cx + Math.sin(time * blob.sway) * NEBULA_SWAY_AMP) * width;
  const color = blob.isAccent ? colors.accent : colors.primary;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = blobGradient(ctx, cx, blob.cy * height, blob.radius * width, color);
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
}


/**
 * Soft radial gradient (color centre → transparent edge) for a blob.
 * @param ctx Canvas 2D context.
 * @param cx Centre x in CSS pixels.
 * @param cy Centre y in CSS pixels.
 * @param radius Blob radius in CSS pixels.
 * @param color Blob colour.
 */
function blobGradient(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: string): CanvasGradient {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'transparent');
  return gradient;
}
