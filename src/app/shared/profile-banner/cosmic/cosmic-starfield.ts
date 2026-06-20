/**
 * @file Parallax starfield for the cosmic banner: depth layers of drifting,
 * twinkling stars. Pure canvas helpers — the scene owns timing and the canvas.
 */

const STAR_LAYERS = 3;
const STARS_PER_LAYER = 84;
const STAR_CAP = 380;
const LAYER_SPEED = [0.006, 0.013, 0.024];
const LAYER_RADIUS = [0.6, 0.95, 1.5];
const LAYER_ALPHA = [0.4, 0.62, 0.88];
const RADIUS_JITTER = 0.35;
const TWINKLE_SPEED_MIN = 0.001;
const TWINKLE_SPEED_MAX = 0.004;
const TWINKLE_FLOOR = 0.45;
const TWINKLE_DEPTH = 0.55;
const HALF = 0.5;
const TWO_PI = Math.PI * 2;

/** One star with its parallax speed and independent twinkle phase. */
export interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  speed: number;
  twinklePhase: number;
  twinkleSpeed: number;
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
 * Builds the depth-layered star list scaled by density (total capped).
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param density Star-count multiplier from the preset.
 */
export function createStars(width: number, height: number, density: number): Star[] {
  const stars: Star[] = [];
  const perLayer = Math.round(STARS_PER_LAYER * density);
  for (let layer = 0; layer < STAR_LAYERS; layer++) {
    for (let i = 0; i < perLayer && stars.length < STAR_CAP; i++) {
      stars.push(makeStar(width, height, layer));
    }
  }
  return stars;
}


/**
 * Creates one star on the given depth layer.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param layer Depth-layer index (deeper = slower, fainter).
 */
function makeStar(width: number, height: number, layer: number): Star {
  return {
    x: rand(0, width),
    y: rand(0, height),
    radius: LAYER_RADIUS[layer] * rand(1 - RADIUS_JITTER, 1 + RADIUS_JITTER),
    baseAlpha: LAYER_ALPHA[layer],
    speed: LAYER_SPEED[layer],
    twinklePhase: rand(0, TWO_PI),
    twinkleSpeed: rand(TWINKLE_SPEED_MIN, TWINKLE_SPEED_MAX),
  };
}


/**
 * Advances and draws every star for one frame.
 * @param ctx Canvas 2D context.
 * @param stars Star list.
 * @param width Canvas width (for horizontal wrap).
 * @param color Star fill color.
 * @param dt Elapsed time since the last frame in ms.
 */
export function drawStarfield(
  ctx: CanvasRenderingContext2D,
  stars: Star[],
  width: number,
  color: string,
  dt: number,
): void {
  ctx.fillStyle = color;
  for (const star of stars) {
    updateStar(star, width, dt);
    drawStar(ctx, star);
  }
  ctx.globalAlpha = 1;
}


/**
 * Drifts a star with parallax and advances its twinkle phase.
 * @param star Star to advance.
 * @param width Canvas width for wrap-around.
 * @param dt Elapsed time in ms.
 */
function updateStar(star: Star, width: number, dt: number): void {
  star.x -= star.speed * dt;
  if (star.x < 0) star.x += width;
  star.twinklePhase += star.twinkleSpeed * dt;
}


/**
 * Draws one star at its twinkled opacity.
 * @param ctx Canvas 2D context.
 * @param star Star to draw.
 */
function drawStar(ctx: CanvasRenderingContext2D, star: Star): void {
  ctx.globalAlpha = star.baseAlpha * twinkle(star.twinklePhase);
  ctx.beginPath();
  ctx.arc(star.x, star.y, star.radius, 0, TWO_PI);
  ctx.fill();
}


/**
 * Twinkle multiplier in [TWINKLE_FLOOR, 1] from a phase.
 * @param phase Current twinkle phase in radians.
 */
function twinkle(phase: number): number {
  return TWINKLE_FLOOR + TWINKLE_DEPTH * (HALF + HALF * Math.sin(phase));
}
