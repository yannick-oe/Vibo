/**
 * @file Single app-level overlay rendering the celebratory reaction effects on
 * one fixed full-viewport canvas above all panels. Decorative and
 * non-interactive (aria-hidden, pointer-events:none); each request plays once
 * and auto-cleans after a bounded duration. Skipped entirely when the user
 * prefers reduced motion or reduced transparency — the reaction still registers.
 */
import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';

import { EffectKind } from '../../models/reactions';
import { EffectsService } from '../../services/effects.service';
import { Particle, mixHex, spawnParticles, stepFrame } from './effects-particles';

const EFFECT_MAX_MS = 4000;
const MAX_DPR = 2;
const PRIMARY_VAR = '--color-primary';
const ACCENT_VAR = '--color-accent';
const MIX_HALF = 0.5;
const HEART_TINT = 0.4;
const WHITE = '#ffffff';

/**
 * Renders requested big-reaction effects. Listens to {@link EffectsService}
 * and animates a bounded particle set on a device-pixel-scaled canvas.
 */
@Component({
  selector: 'app-effects-overlay',
  template: '<canvas #canvas class="effects" aria-hidden="true"></canvas>',
  styleUrl: './effects-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'effects-host' },
})
export class EffectsOverlayComponent {
  private readonly effectsService = inject(EffectsService);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private particles: Particle[] = [];

  private startedAt = 0;

  private rafId = 0;


  /**
   * Subscribes to effect requests and plays each one as it arrives.
   */
  constructor() {
    effect(() => this.onRequest());
  }


  /**
   * Plays the latest requested effect unless reduced motion/transparency is
   * preferred; the early null request on startup is ignored.
   */
  private onRequest(): void {
    const request = this.effectsService.request();
    if (!request || shouldSkip()) return;
    this.start(request.kind);
  }


  /**
   * Prepares the canvas, spawns the particles and starts the animation loop.
   * @param kind Effect kind to play.
   */
  private start(kind: EffectKind): void {
    const element = this.canvas().nativeElement;
    const ctx = prepareCanvas(element);
    if (!ctx) return;
    const colors = this.effectColors(kind);
    this.particles = spawnParticles(kind, element.clientWidth, element.clientHeight, colors);
    this.startedAt = performance.now();
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(time => this.frame(ctx, time));
  }


  /**
   * Advances one animation frame; stops and clears once all particles fade or
   * the hard time cap is reached.
   * @param ctx Canvas 2D context.
   * @param time Current animation timestamp.
   */
  private frame(ctx: CanvasRenderingContext2D, time: number): void {
    const element = this.canvas().nativeElement;
    this.particles = stepFrame(ctx, this.particles, element.clientWidth, element.clientHeight);
    const expired = time - this.startedAt > EFFECT_MAX_MS;
    if (this.particles.length && !expired) {
      this.rafId = requestAnimationFrame(next => this.frame(ctx, next));
      return;
    }
    ctx.clearRect(0, 0, element.clientWidth, element.clientHeight);
  }


  /**
   * Brand color palette for an effect, read live from the active theme tokens
   * so light and dark each get their own aurora hues.
   * @param kind Effect kind to build colors for.
   */
  private effectColors(kind: EffectKind): string[] {
    const styles = getComputedStyle(document.documentElement);
    const primary = styles.getPropertyValue(PRIMARY_VAR).trim();
    const accent = styles.getPropertyValue(ACCENT_VAR).trim();
    if (kind === 'hearts') return [accent, mixHex(accent, WHITE, HEART_TINT)];
    return [primary, mixHex(primary, accent, MIX_HALF), accent];
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
 * Whether the full-screen effect must be suppressed because the user prefers
 * reduced motion or reduced transparency.
 */
function shouldSkip(): boolean {
  return prefersReduced('(prefers-reduced-motion: reduce)') ||
    prefersReduced('(prefers-reduced-transparency: reduce)');
}


/**
 * Whether a CSS media query currently matches.
 * @param queryString Media query to evaluate.
 */
function prefersReduced(queryString: string): boolean {
  return window.matchMedia(queryString).matches;
}
