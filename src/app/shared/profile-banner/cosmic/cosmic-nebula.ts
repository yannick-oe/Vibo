/**
 * @file Colored nebula clouds for the cosmic banner: a few large soft radial
 * blobs that slowly drift and gently pulse in opacity, in the decorative
 * violet/magenta/indigo/rose banner palette. Pure canvas helpers, used only by
 * the nebula preset; the twinkling star pinpoints come from the shared starfield.
 */
import type { CosmicColors } from './cosmic-scene';

/** A decorative nebula tone keyed into the resolved palette. */
type NebulaTone = 'nebulaViolet' | 'nebulaMagenta' | 'nebulaIndigo' | 'nebulaRose';

/** One nebula blob: centre/size as fractions of the canvas plus drift/pulse speeds. */
interface NebulaBlob {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly sway: number;
  readonly pulse: number;
  readonly tone: NebulaTone;
}

const NEBULA_BLOBS: readonly NebulaBlob[] = [
  { cx: 0.26, cy: 0.36, radius: 0.55, sway: 0.00004, pulse: 0.0006, tone: 'nebulaViolet' },
  { cx: 0.7, cy: 0.56, radius: 0.52, sway: -0.00003, pulse: 0.0005, tone: 'nebulaMagenta' },
  { cx: 0.5, cy: 0.8, radius: 0.46, sway: 0.00005, pulse: 0.0007, tone: 'nebulaIndigo' },
  { cx: 0.82, cy: 0.28, radius: 0.36, sway: -0.00004, pulse: 0.0008, tone: 'nebulaRose' },
];
const NEBULA_ALPHA = 0.42;
const NEBULA_DIM_ALPHA = 0.2;
const NEBULA_SWAY_AMP = 0.05;
const NEBULA_PULSE_DEPTH = 0.18;


/**
 * Draws the nebula clouds for one frame (additive unless dimmed); each blob
 * drifts and breathes in opacity, scaled by the preset intensity.
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
 * Fills the canvas with one swaying, gently pulsing radial nebula blob.
 * @param ctx Canvas 2D context.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param blob Blob definition.
 * @param colors Resolved cosmic palette.
 * @param alpha Base blob opacity.
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
  const pulse = 1 + NEBULA_PULSE_DEPTH * Math.sin(time * blob.pulse);
  ctx.globalAlpha = Math.max(0, alpha * pulse);
  ctx.fillStyle = blobGradient(ctx, cx, blob.cy * height, blob.radius * width, colors[blob.tone]);
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
}


/**
 * Soft radial gradient (colour centre → transparent edge) for a blob.
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
