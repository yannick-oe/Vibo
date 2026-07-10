/**
 * @file App-level overlay that renders broadcast big-reaction effects on one
 * fixed full-viewport canvas above all panels: confetti, floating hearts and a
 * cross-screen rocket (full-screen shape particles) and the 😂 laugh burst
 * (emoji glyphs arcing from the reacted message). Decorative and
 * non-interactive (aria-hidden, pointer-events:none), GPU-only via canvas (no
 * layout, CLS 0); each request plays once and tears down. Under
 * prefers-reduced-motion every effect becomes one subtle pop of its emoji.
 */
import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';

import { EFFECT_EMOJI, EffectKind } from '../../models/reactions';
import { BigReactionRequest, BigReactionService } from '../../services/big-reaction.service';
import {
  GlyphParticle,
  spawnBurst,
  spawnPop,
  spawnRain,
  spawnRise,
  stepFrame as stepGlyphs,
} from './glyph-particles';
import { Particle, mixHex, spawnParticles, stepFrame as stepShapes } from './shape-particles';
import { Bolt, spawnBolts, stepBolts } from './bolt-particles';

const MAX_MS = 4000;
const MAX_DPR = 2;
const PRIMARY_VAR = '--color-primary';
const ACCENT_VAR = '--color-accent';
const MIX_HALF = 0.5;
const HEART_TINT = 0.4;
const WHITE = '#ffffff';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Renders requested big-reaction effects. Listens to {@link BigReactionService}
 * and animates a bounded particle set on a device-pixel-scaled canvas, picking
 * the shape engine or the glyph engine per request.
 */
@Component({
  selector: 'app-big-reaction-overlay',
  template: '<canvas #canvas class="big-reaction" aria-hidden="true"></canvas>',
  styleUrl: './big-reaction-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'big-reaction-host' },
})
export class BigReactionOverlayComponent {
  private readonly bigReactionService = inject(BigReactionService);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private shapes: Particle[] = [];

  private glyphs: GlyphParticle[] = [];

  private bolts: Bolt[] = [];

  private mode: 'shape' | 'glyph' | 'bolt' = 'glyph';

  private startedAt = 0;

  private rafId = 0;


  /**
   * Subscribes to big-reaction requests and plays each one as it arrives.
   */
  constructor() {
    effect(() => this.onRequest());
  }


  /**
   * Plays the latest requested effect; the early null request on startup is
   * ignored.
   */
  private onRequest(): void {
    const request = this.bigReactionService.request();
    if (!request) return;
    this.start(request);
  }


  /**
   * Prepares the canvas, spawns the particle set and starts the loop.
   * @param request Effect type, burst origin and change token.
   */
  private start(request: BigReactionRequest): void {
    const element = this.canvas().nativeElement;
    const ctx = prepareCanvas(element);
    if (!ctx) return;
    this.spawn(request, element.clientWidth, element.clientHeight);
    this.startedAt = performance.now();
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(time => this.frame(ctx, time));
  }


  /**
   * Selects the engine: a subtle emoji pop under reduced motion, the glyph
   * burst for the laugh, otherwise the full-screen shape particles.
   * @param request Effect type and burst origin.
   * @param width Canvas width in CSS pixels.
   * @param height Canvas height in CSS pixels.
   */
  private spawn(request: BigReactionRequest, width: number, height: number): void {
    const { type, origin } = request;
    if (reducedMotion()) return this.useGlyphs(spawnPop(EFFECT_EMOJI[type], origin.x, origin.y));
    const glyphs = glyphsFor(type, origin.x, origin.y, width, height);
    if (glyphs) return this.useGlyphs(glyphs);
    if (type === 'flash') return this.useBolts(spawnBolts(width, height, effectColors(type)));
    this.mode = 'shape';
    this.shapes = spawnParticles(type, width, height, effectColors(type));
  }


  /**
   * Switches the overlay to the lightning bolt engine with the given bolts.
   * @param bolts Bolts to animate.
   */
  private useBolts(bolts: Bolt[]): void {
    this.mode = 'bolt';
    this.bolts = bolts;
  }


  /**
   * Switches the overlay to the glyph engine with the given particles.
   * @param glyphs Glyph particles to animate.
   */
  private useGlyphs(glyphs: GlyphParticle[]): void {
    this.mode = 'glyph';
    this.glyphs = glyphs;
  }


  /**
   * Advances one animation frame; stops and clears once all particles fade or
   * the hard time cap is reached.
   * @param ctx Canvas 2D context.
   * @param time Current animation timestamp.
   */
  private frame(ctx: CanvasRenderingContext2D, time: number): void {
    const element = this.canvas().nativeElement;
    this.step(ctx, element.clientWidth, element.clientHeight);
    const expired = time - this.startedAt > MAX_MS;
    if (this.alive() && !expired) {
      this.rafId = requestAnimationFrame(next => this.frame(ctx, next));
      return;
    }
    ctx.clearRect(0, 0, element.clientWidth, element.clientHeight);
  }


  /**
   * Steps the active engine's particles for one frame.
   * @param ctx Canvas 2D context.
   * @param width Canvas width in CSS pixels.
   * @param height Canvas height in CSS pixels.
   */
  private step(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.mode === 'shape') this.shapes = stepShapes(ctx, this.shapes, width, height);
    else if (this.mode === 'bolt') this.bolts = stepBolts(ctx, this.bolts, width, height);
    else this.glyphs = stepGlyphs(ctx, this.glyphs, width, height);
  }


  /**
   * Whether the active engine still has live particles.
   */
  private alive(): boolean {
    if (this.mode === 'shape') return this.shapes.length > 0;
    if (this.mode === 'bolt') return this.bolts.length > 0;
    return this.glyphs.length > 0;
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
 * Brand color palette for a shape effect, read live from the active theme
 * tokens so light and dark each get their own aurora hues.
 * @param kind Effect kind to build colors for.
 */
function effectColors(kind: EffectKind): string[] {
  const styles = getComputedStyle(document.documentElement);
  const primary = styles.getPropertyValue(PRIMARY_VAR).trim();
  const accent = styles.getPropertyValue(ACCENT_VAR).trim();
  if (kind === 'hearts') return [accent, mixHex(accent, WHITE, HEART_TINT)];
  return [primary, mixHex(primary, accent, MIX_HALF), accent];
}


/**
 * The glyph-engine particles for an emoji-glyph effect, or null for the
 * full-screen shape effects (confetti/hearts/rocket). Bursts radiate from the
 * message (laugh/clap/flash); fire rises from the bottom, tears rain from the top.
 * @param type Effect kind to build.
 * @param x Burst origin x in CSS pixels.
 * @param y Burst origin y in CSS pixels.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 */
function glyphsFor(
  type: EffectKind,
  x: number,
  y: number,
  width: number,
  height: number,
): GlyphParticle[] | null {
  if (type === 'laugh') return spawnBurst(EFFECT_EMOJI.laugh, x, y);
  if (type === 'fire' || type === 'clap') return spawnRise(EFFECT_EMOJI[type], width, height);
  if (type === 'tear') return spawnRain(EFFECT_EMOJI.tear, width);
  return null;
}


/**
 * Whether the user prefers reduced motion, so every effect is replaced by the
 * single subtle pop.
 */
function reducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
