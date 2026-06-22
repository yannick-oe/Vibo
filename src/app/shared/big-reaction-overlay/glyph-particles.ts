/**
 * @file Pure canvas particle helpers for the emoji-glyph big-reaction effects:
 * the laugh burst (😂 glyphs launched up-left and up-right from a message,
 * arcing under gravity and fading like tears of joy) and the single subtle pop
 * used as the reduced-motion fallback for every reaction. No DOM or Angular
 * access — the overlay owns the canvas and the animation loop.
 */

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const BURST_MIN = 18;
const BURST_MAX = 24;
const GRAVITY = 0.3;
const BURST_DECAY = 0.009;
const SPEED_MIN = 6;
const SPEED_MAX = 12;
const ANGLE_MIN = 0.85;
const ANGLE_MAX = 1.3;
const SIZE_MIN = 20;
const SIZE_MAX = 34;
const SPIN_MAX = 0.16;
const POP_DECAY = 0.04;
const POP_SIZE = 42;
const POP_GROWTH = 0.16;
const HALF = 0.5;
const TWO_PI = Math.PI * 2;

/** One animated emoji glyph in canvas CSS-pixel space; life fades 1 → 0. */
export interface GlyphParticle {
  glyph: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  rotation: number;
  spin: number;
  pop: boolean;
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
 * Builds a laugh burst of glyphs fanning out and upward from the origin.
 * @param glyph Emoji character to render.
 * @param x Origin x in CSS pixels.
 * @param y Origin y in CSS pixels.
 */
export function spawnBurst(glyph: string, x: number, y: number): GlyphParticle[] {
  const count = Math.round(rand(BURST_MIN, BURST_MAX));
  return Array.from({ length: count }, () => makeGlyph(glyph, x, y));
}


/**
 * Creates one glyph launched left or right within an upward cone.
 * @param glyph Emoji character to render.
 * @param x Origin x in CSS pixels.
 * @param y Origin y in CSS pixels.
 */
function makeGlyph(glyph: string, x: number, y: number): GlyphParticle {
  const speed = rand(SPEED_MIN, SPEED_MAX);
  const angle = rand(ANGLE_MIN, ANGLE_MAX);
  const direction = Math.random() < HALF ? -1 : 1;
  return {
    glyph, x, y, vx: Math.cos(angle) * speed * direction, vy: -Math.sin(angle) * speed,
    life: 1, decay: BURST_DECAY, size: rand(SIZE_MIN, SIZE_MAX),
    rotation: rand(0, TWO_PI), spin: rand(-SPIN_MAX, SPIN_MAX), pop: false,
  };
}


/**
 * Builds the single subtle pop glyph for the reduced-motion fallback: it
 * stays put, grows slightly and fades — no particle storm.
 * @param glyph Emoji character to render.
 * @param x Origin x in CSS pixels.
 * @param y Origin y in CSS pixels.
 */
export function spawnPop(glyph: string, x: number, y: number): GlyphParticle[] {
  return [{
    glyph, x, y, vx: 0, vy: 0, life: 1, decay: POP_DECAY,
    size: POP_SIZE, rotation: 0, spin: 0, pop: true,
  }];
}


/**
 * Advances and redraws all glyphs for one frame, returning those still alive.
 * @param ctx Canvas 2D context.
 * @param particles Current glyphs.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 */
export function stepFrame(
  ctx: CanvasRenderingContext2D,
  particles: GlyphParticle[],
  width: number,
  height: number,
): GlyphParticle[] {
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const alive: GlyphParticle[] = [];
  for (const particle of particles) {
    update(particle);
    draw(ctx, particle);
    if (particle.life > 0) alive.push(particle);
  }
  return alive;
}


/**
 * Updates one glyph's motion and life for a single frame; the pop glyph only
 * fades while burst glyphs arc and spin.
 * @param p Glyph to advance.
 */
function update(p: GlyphParticle): void {
  if (!p.pop) {
    p.vy += GRAVITY;
    p.rotation += p.spin;
    p.x += p.vx;
    p.y += p.vy;
  }
  p.life -= p.decay;
}


/**
 * Draws one glyph at its position with life-based opacity; the pop glyph
 * grows gently as it fades.
 * @param ctx Canvas 2D context.
 * @param p Glyph to draw.
 */
function draw(ctx: CanvasRenderingContext2D, p: GlyphParticle): void {
  const scale = p.pop ? 1 + (1 - p.life) * POP_GROWTH : 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, p.life);
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.font = `${p.size * scale}px ${EMOJI_FONT}`;
  ctx.fillText(p.glyph, 0, 0);
  ctx.restore();
}
