/**
 * @file Pure canvas helper for the lightning big-reaction effect: one or two
 * jagged bolt paths struck top-to-bottom across the screen, revealed by an
 * animated line-dash offset with a glowing trail and a fainter forked branch,
 * then fading out. A clearly distinct silhouette from the straight rocket
 * streaks. No strobing and no full-screen luminance flash (WCAG 2.3.1). No DOM
 * or Angular access — the overlay owns the canvas and the animation loop.
 */

/** A point on a bolt path in canvas CSS-pixel space. */
interface Point {
  x: number;
  y: number;
}

/** One lightning bolt: its jagged path and branch, reveal progress and fade. */
export interface Bolt {
  points: Point[];
  branch: Point[];
  progress: number;
  life: number;
  width: number;
  color: string;
}

const BOLT_MIN = 1;
const BOLT_COUNT_SPREAD = 1.49;
const SEGMENTS = 11;
const JITTER = 0.14;
const DRIFT = 0.5;
const REVEAL_SPEED = 0.09;
const FADE_SPEED = 0.05;
const WIDTH_MIN = 2.5;
const WIDTH_MAX = 4;
const GLOW = 16;
const BRANCH_AT = 0.55;
const BRANCH_SEGMENTS = 4;
const BRANCH_SPREAD = 0.22;
const BRANCH_ALPHA = 0.5;
const BRANCH_WIDTH = 0.6;


/**
 * Random float in the half-open interval [min, max).
 * @param min Lower bound.
 * @param max Upper bound (exclusive).
 */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}


/**
 * Builds one or two bolts striking diagonally across the canvas.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param colors Brand colors; the first tints the bolt and its glow.
 */
export function spawnBolts(width: number, height: number, colors: string[]): Bolt[] {
  const count = Math.round(rand(BOLT_MIN, BOLT_MIN + BOLT_COUNT_SPREAD));
  return Array.from({ length: count }, (_unused, index) => makeBolt(width, height, colors, index));
}


/**
 * Creates one bolt: a jagged top-to-bottom path drifting sideways, a short
 * fork near its middle, and a random stroke width.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param colors Brand colors; the first tints the bolt.
 * @param index Bolt index, alternating the drift direction.
 */
function makeBolt(width: number, height: number, colors: string[], index: number): Bolt {
  const points = jaggedPath(width * rand(0.15, 0.85), width, height, index % 2 === 0 ? 1 : -1);
  return {
    points,
    branch: forkFrom(points, width, height),
    progress: 0,
    life: 1,
    width: rand(WIDTH_MIN, WIDTH_MAX),
    color: colors[0] ?? '#ffffff',
  };
}


/**
 * A jagged polyline from the top edge to the bottom edge, drifting sideways,
 * with horizontal jitter on the interior points (endpoints stay clean).
 * @param startX Start x in CSS pixels.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @param dir Sideways drift direction (+1 / -1).
 */
function jaggedPath(startX: number, width: number, height: number, dir: number): Point[] {
  return Array.from({ length: SEGMENTS + 1 }, (_unused, i) => {
    const progress = i / SEGMENTS;
    const jitter = i === 0 || i === SEGMENTS ? 0 : rand(-JITTER, JITTER) * width;
    return { x: startX + dir * progress * width * DRIFT + jitter, y: progress * height };
  });
}


/**
 * A short forked offshoot branching off near the middle of the main path.
 * @param points Main bolt path.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 */
function forkFrom(points: Point[], width: number, height: number): Point[] {
  const root = points[Math.floor(points.length * BRANCH_AT)];
  const dir = Math.random() < 0.5 ? -1 : 1;
  return Array.from({ length: BRANCH_SEGMENTS + 1 }, (_unused, i) => {
    const progress = i / BRANCH_SEGMENTS;
    return { x: root.x + dir * progress * width * BRANCH_SPREAD, y: root.y + progress * height * BRANCH_SPREAD };
  });
}


/**
 * Advances every bolt one frame — revealing, then fading — and redraws them,
 * returning those still alive.
 * @param ctx Canvas 2D context.
 * @param bolts Current bolts.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 */
export function stepBolts(ctx: CanvasRenderingContext2D, bolts: Bolt[], width: number, height: number): Bolt[] {
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const alive: Bolt[] = [];
  for (const bolt of bolts) {
    advance(bolt);
    drawBolt(ctx, bolt);
    if (bolt.life > 0) alive.push(bolt);
  }
  return alive;
}


/**
 * Advances a bolt's reveal until struck, then its fade.
 * @param bolt Bolt to advance.
 */
function advance(bolt: Bolt): void {
  if (bolt.progress < 1) bolt.progress = Math.min(1, bolt.progress + REVEAL_SPEED);
  else bolt.life -= FADE_SPEED;
}


/**
 * Draws a bolt: the glowing main path plus the fainter, thinner branch (which
 * reveals once the main path has passed its fork point).
 * @param ctx Canvas 2D context.
 * @param bolt Bolt to draw.
 */
function drawBolt(ctx: CanvasRenderingContext2D, bolt: Bolt): void {
  ctx.save();
  ctx.strokeStyle = bolt.color;
  ctx.shadowColor = bolt.color;
  ctx.shadowBlur = GLOW;
  const alpha = Math.max(0, bolt.life);
  strokeReveal(ctx, bolt.points, bolt.progress, bolt.width, alpha);
  const branchProgress = Math.max(0, (bolt.progress - BRANCH_AT) / (1 - BRANCH_AT));
  strokeReveal(ctx, bolt.branch, branchProgress, bolt.width * BRANCH_WIDTH, alpha * BRANCH_ALPHA);
  ctx.restore();
}


/**
 * Strokes a polyline revealed to the given progress via an animated line dash.
 * @param ctx Canvas 2D context.
 * @param points Polyline points.
 * @param progress Reveal fraction 0 → 1.
 * @param width Stroke width in CSS pixels.
 * @param alpha Stroke opacity.
 */
function strokeReveal(ctx: CanvasRenderingContext2D, points: Point[], progress: number, width: number, alpha: number): void {
  if (points.length < 2 || progress <= 0 || alpha <= 0) return;
  const length = pathLength(points);
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.setLineDash([length, length]);
  ctx.lineDashOffset = length * (1 - progress);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}


/**
 * The total pixel length of a polyline, used to size the reveal dash.
 * @param points Polyline points.
 */
function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}
