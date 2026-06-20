/**
 * @file A rare shooting star for the cosmic banner: a brief glowing streak on
 * a randomized cooldown so it appears occasionally, never constantly. Pure
 * canvas helpers driven by elapsed time (so a single static frame draws none).
 */

const GAP_MIN_MS = 5000;
const GAP_MAX_MS = 11000;
const SPEED = 0.9;
const LIFE_MS = 850;
const TRAIL = 90;
const SLOPE = 0.45;
const START_X_MAX = 0.5;
const START_Y_MAX = 0.45;
const TRAIL_WIDTH = 2;

/** A shooting star: its motion, age and cooldown until the next appearance. */
export interface ShootingStar {
  isActive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  cooldown: number;
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
 * Creates an inactive shooting star with a randomized initial cooldown.
 */
export function createShootingStar(): ShootingStar {
  return { isActive: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, cooldown: rand(GAP_MIN_MS, GAP_MAX_MS) };
}


/**
 * Advances the shooting star and draws it while active; counts down the
 * cooldown and spawns when it elapses.
 * @param ctx Canvas 2D context.
 * @param shot Shooting-star state.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param color Streak colour.
 * @param dt Elapsed time since the last frame in ms.
 */
export function stepShootingStar(
  ctx: CanvasRenderingContext2D,
  shot: ShootingStar,
  width: number,
  height: number,
  color: string,
  dt: number,
): void {
  if (!shot.isActive) {
    shot.cooldown -= dt;
    if (shot.cooldown <= 0) spawn(shot, width, height);
    return;
  }
  advance(shot, dt);
  if (shot.age >= LIFE_MS) return reset(shot);
  drawStreak(ctx, shot, color);
}


/**
 * Launches the streak from the upper-left toward the lower-right.
 * @param shot Shooting-star state.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 */
function spawn(shot: ShootingStar, width: number, height: number): void {
  shot.isActive = true;
  shot.age = 0;
  shot.x = rand(0, width * START_X_MAX);
  shot.y = rand(0, height * START_Y_MAX);
  shot.vx = SPEED;
  shot.vy = SPEED * SLOPE;
}


/**
 * Moves the streak and ages it for one frame.
 * @param shot Shooting-star state.
 * @param dt Elapsed time in ms.
 */
function advance(shot: ShootingStar, dt: number): void {
  shot.x += shot.vx * dt;
  shot.y += shot.vy * dt;
  shot.age += dt;
}


/**
 * Deactivates the streak and schedules the next appearance.
 * @param shot Shooting-star state.
 */
function reset(shot: ShootingStar): void {
  shot.isActive = false;
  shot.cooldown = rand(GAP_MIN_MS, GAP_MAX_MS);
}


/**
 * Draws the streak as a fading tail behind its head.
 * @param ctx Canvas 2D context.
 * @param shot Shooting-star state.
 * @param color Streak colour.
 */
function drawStreak(ctx: CanvasRenderingContext2D, shot: ShootingStar, color: string): void {
  const tailX = shot.x - shot.vx * TRAIL;
  const tailY = shot.y - shot.vy * TRAIL;
  ctx.save();
  ctx.globalAlpha = 1 - shot.age / LIFE_MS;
  ctx.strokeStyle = streakGradient(ctx, shot, tailX, tailY, color);
  ctx.lineWidth = TRAIL_WIDTH;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shot.x, shot.y);
  ctx.lineTo(tailX, tailY);
  ctx.stroke();
  ctx.restore();
}


/**
 * Builds the head→tail fade gradient of the streak.
 * @param ctx Canvas 2D context.
 * @param shot Shooting-star state (the bright head).
 * @param tailX Tail x in CSS pixels.
 * @param tailY Tail y in CSS pixels.
 * @param color Streak colour at the head.
 */
function streakGradient(
  ctx: CanvasRenderingContext2D,
  shot: ShootingStar,
  tailX: number,
  tailY: number,
  color: string,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(shot.x, shot.y, tailX, tailY);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'transparent');
  return gradient;
}
