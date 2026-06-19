/**
 * @file Pure canvas particle helpers for the celebratory reaction effects:
 * aurora confetti raining down and soft glowing hearts floating up. No DOM or
 * Angular access — the overlay component owns the canvas and animation loop.
 */
import { EffectKind } from '../../models/reactions';

const CONFETTI_COUNT = 110;
const HEARTS_COUNT = 22;
const SPAWN_MARGIN = 40;
const GRAVITY = 0.16;
const CONFETTI_DECAY = 0.0085;
const HEARTS_DECAY = 0.006;
const CONFETTI_SPREAD = 7;
const CONFETTI_LAUNCH = 4;
const CONFETTI_SIZE_MIN = 6;
const CONFETTI_SIZE_MAX = 13;
const CONFETTI_SPIN = 0.3;
const CONFETTI_RATIO = 0.6;
const HEART_RISE_MIN = 1.4;
const HEART_RISE_MAX = 3.2;
const HEART_SIZE_MIN = 16;
const HEART_SIZE_MAX = 34;
const HEART_SWAY = 1.1;
const HEART_SWAY_SPEED = 0.05;
const HEART_GLOW = 18;
const HEART_NOTCH = 0.25;
const HEART_TIP = 0.5;
const HEART_LOBE_X = 0.5;
const HEART_LOBE_TOP = 0.7;
const HEART_WIDE_X = 0.9;
const HEART_WIDE_Y = 0.1;
const TWO_PI = Math.PI * 2;
const BYTE = 255;

/** One animated particle in canvas CSS-pixel space; life fades 1 → 0. */
export interface Particle {
  kind: EffectKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  phase: number;
}


/**
 * Random float in the half-open interval [min, max).
 * @param min Lower bound.
 * @param max Upper bound (exclusive).
 */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}


/**
 * Picks a random element from a non-empty list.
 * @param items Candidate values.
 */
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}


/**
 * Builds the particle set for an effect kind across the given canvas size.
 * @param kind Effect to spawn.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param colors Brand colors the particles draw with.
 */
export function spawnParticles(kind: EffectKind, width: number, height: number, colors: string[]): Particle[] {
  return kind === 'confetti' ? spawnConfetti(width, colors) : spawnHearts(width, height, colors);
}


/**
 * Confetti pieces seeded just above the top edge, fanning out and falling.
 * @param width Canvas width in CSS pixels.
 * @param colors Brand colors to tint pieces with.
 */
function spawnConfetti(width: number, colors: string[]): Particle[] {
  return Array.from({ length: CONFETTI_COUNT }, () => makeConfetti(width, colors));
}


/**
 * Creates one confetti piece at a random position above the top edge.
 * @param width Canvas width in CSS pixels.
 * @param colors Brand colors to tint the piece with.
 */
function makeConfetti(width: number, colors: string[]): Particle {
  return {
    kind: 'confetti', x: rand(0, width), y: rand(-SPAWN_MARGIN, 0),
    vx: rand(-CONFETTI_SPREAD, CONFETTI_SPREAD), vy: rand(0, CONFETTI_LAUNCH),
    life: 1, decay: CONFETTI_DECAY, size: rand(CONFETTI_SIZE_MIN, CONFETTI_SIZE_MAX),
    color: pick(colors), rotation: rand(0, TWO_PI), spin: rand(-CONFETTI_SPIN, CONFETTI_SPIN), phase: 0,
  };
}


/**
 * Hearts seeded along the bottom edge, drifting upward with a gentle sway.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param colors Brand colors to tint hearts with.
 */
function spawnHearts(width: number, height: number, colors: string[]): Particle[] {
  return Array.from({ length: HEARTS_COUNT }, () => makeHeart(width, height, colors));
}


/**
 * Creates one heart near the bottom edge rising upward.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param colors Brand colors to tint the heart with.
 */
function makeHeart(width: number, height: number, colors: string[]): Particle {
  return {
    kind: 'hearts', x: rand(0, width), y: rand(height, height + SPAWN_MARGIN),
    vx: 0, vy: -rand(HEART_RISE_MIN, HEART_RISE_MAX),
    life: 1, decay: HEARTS_DECAY, size: rand(HEART_SIZE_MIN, HEART_SIZE_MAX),
    color: pick(colors), rotation: 0, spin: 0, phase: rand(0, TWO_PI),
  };
}


/**
 * Advances and redraws all particles for one frame, returning those still
 * alive (life remaining above zero).
 * @param ctx Canvas 2D context.
 * @param particles Current particles.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 */
export function stepFrame(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  width: number,
  height: number,
): Particle[] {
  ctx.clearRect(0, 0, width, height);
  const alive: Particle[] = [];
  for (const particle of particles) {
    update(particle);
    draw(ctx, particle);
    if (particle.life > 0) alive.push(particle);
  }
  return alive;
}


/**
 * Updates one particle's motion and life for a single frame.
 * @param p Particle to advance.
 */
function update(p: Particle): void {
  if (p.kind === 'confetti') {
    p.vy += GRAVITY;
    p.rotation += p.spin;
  } else {
    p.phase += HEART_SWAY_SPEED;
    p.vx = Math.sin(p.phase) * HEART_SWAY;
  }
  p.x += p.vx;
  p.y += p.vy;
  p.life -= p.decay;
}


/**
 * Draws one particle at its position with life-based opacity.
 * @param ctx Canvas 2D context.
 * @param p Particle to draw.
 */
function draw(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, p.life);
  if (p.kind === 'confetti') drawConfetti(ctx, p);
  else drawHeart(ctx, p);
  ctx.restore();
}


/**
 * Draws a confetti piece as a small rotated rectangle strip.
 * @param ctx Canvas 2D context.
 * @param p Confetti particle.
 */
function drawConfetti(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.fillStyle = p.color;
  ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * CONFETTI_RATIO);
}


/**
 * Draws a soft glowing heart centered on the particle.
 * @param ctx Canvas 2D context.
 * @param p Heart particle.
 */
function drawHeart(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.translate(p.x, p.y);
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = HEART_GLOW;
  ctx.beginPath();
  traceHeart(ctx, p.size);
  ctx.fill();
}


/**
 * Traces a heart outline centered at the origin into the current path.
 * @param ctx Canvas 2D context.
 * @param s Heart size in pixels.
 */
function traceHeart(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.moveTo(0, -s * HEART_NOTCH);
  ctx.bezierCurveTo(-s * HEART_LOBE_X, -s * HEART_LOBE_TOP, -s * HEART_WIDE_X, s * HEART_WIDE_Y, 0, s * HEART_TIP);
  ctx.bezierCurveTo(s * HEART_WIDE_X, s * HEART_WIDE_Y, s * HEART_LOBE_X, -s * HEART_LOBE_TOP, 0, -s * HEART_NOTCH);
}


/**
 * Linearly blends two #rrggbb colors into an rgb() string.
 * @param a First hex color.
 * @param b Second hex color.
 * @param t Blend ratio: 0 → a, 1 → b.
 */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const channel = (i: number): number => Math.round(ca[i] + (cb[i] - ca[i]) * t);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}


/**
 * Parses a #rrggbb color into its [r, g, b] byte values.
 * @param hex Hex color string.
 */
function parseHex(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16);
  const high = Math.floor(value / (BYTE + 1) / (BYTE + 1)) % (BYTE + 1);
  const mid = Math.floor(value / (BYTE + 1)) % (BYTE + 1);
  return [high, mid, value % (BYTE + 1)];
}
