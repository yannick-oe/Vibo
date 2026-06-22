/**
 * @file App-level overlay rendering the broadcast "laugh burst": 😂 glyphs
 * arcing out from a reacted message on one fixed full-viewport canvas above
 * all panels. Decorative and non-interactive (aria-hidden, pointer-events:
 * none), GPU-only via canvas (no layout, CLS 0); each request plays once and
 * tears down. Under prefers-reduced-motion the storm becomes one subtle 😂 pop.
 */
import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';

import { BigReactionService, LaughBurstRequest } from '../../services/big-reaction.service';
import { LaughParticle, spawnBurst, spawnPop, stepFrame } from './laugh-particles';

const BURST_MAX_MS = 2400;
const MAX_DPR = 2;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Renders requested laugh bursts. Listens to {@link BigReactionService} and
 * animates a bounded glyph set on a device-pixel-scaled canvas.
 */
@Component({
  selector: 'app-laugh-burst-overlay',
  template: '<canvas #canvas class="laugh-burst" aria-hidden="true"></canvas>',
  styleUrl: './laugh-burst-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'laugh-burst-host' },
})
export class LaughBurstOverlayComponent {
  private readonly bigReactionService = inject(BigReactionService);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private particles: LaughParticle[] = [];

  private startedAt = 0;

  private rafId = 0;


  /**
   * Subscribes to laugh-burst requests and plays each one as it arrives.
   */
  constructor() {
    effect(() => this.onRequest());
  }


  /**
   * Plays the latest requested burst; the early null request on startup is
   * ignored.
   */
  private onRequest(): void {
    const request = this.bigReactionService.request();
    if (!request) return;
    this.start(request);
  }


  /**
   * Prepares the canvas, spawns the glyphs (or the reduced-motion pop) and
   * starts the animation loop.
   * @param request Burst origin and change token.
   */
  private start(request: LaughBurstRequest): void {
    const element = this.canvas().nativeElement;
    const ctx = prepareCanvas(element);
    if (!ctx) return;
    const { x, y } = request.origin;
    this.particles = reducedMotion() ? spawnPop(x, y) : spawnBurst(x, y);
    this.startedAt = performance.now();
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(time => this.frame(ctx, time));
  }


  /**
   * Advances one animation frame; stops and clears once all glyphs fade or
   * the hard time cap is reached.
   * @param ctx Canvas 2D context.
   * @param time Current animation timestamp.
   */
  private frame(ctx: CanvasRenderingContext2D, time: number): void {
    const element = this.canvas().nativeElement;
    this.particles = stepFrame(ctx, this.particles, element.clientWidth, element.clientHeight);
    const expired = time - this.startedAt > BURST_MAX_MS;
    if (this.particles.length && !expired) {
      this.rafId = requestAnimationFrame(next => this.frame(ctx, next));
      return;
    }
    ctx.clearRect(0, 0, element.clientWidth, element.clientHeight);
  }
}


/**
 * Sizes the canvas backing store to the viewport at a capped device pixel
 * ratio and returns a context scaled so drawing uses CSS pixels.
 * @param canvas Overlay canvas element.
 */
function prepareCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}


/**
 * Whether the user prefers reduced motion, so the burst is replaced by the
 * single subtle pop.
 */
function reducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
