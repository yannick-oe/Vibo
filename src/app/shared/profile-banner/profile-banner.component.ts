/**
 * @file Presentational profile banner: a <canvas> rendering an animated cosmic
 * scene (parallax starfield + bands/nebula + a rare shooting star) for the
 * selected preset, plus — for the „Polarlicht" preset — three GPU-friendly CSS
 * gradient curtains (teal/green → app purple, transform/opacity only) layered
 * over the starfield. Decorative (aria-hidden), DPR-scaled. The rAF loop runs
 * only while mounted (the profile card is open) and stops on destroy. Reduced
 * motion ⇒ one rich static frame (curtains freeze); reduced transparency ⇒ the
 * glow is toned down; thumbnails/isStatic ⇒ one frame.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';

import { BANNER_AURORA, BANNER_NONE, cosmicParams } from '../banner-options';
import { CosmicColors, CosmicScene, createScene, drawFrame, resolveColors } from './cosmic/cosmic-scene';

const MAX_DPR = 2;
const STATIC_TIME = 1800;

/** Cached CSS pixel size of the canvas box. */
interface Size {
  width: number;
  height: number;
}

/**
 * Renders the cosmic banner for a given preset id; pass the user's resolved
 * banner. The host is sized by the consumer (full card strip or a small picker
 * thumbnail); set isStatic for thumbnails so they draw a single frame.
 */
@Component({
  selector: 'app-profile-banner',
  templateUrl: './profile-banner.component.html',
  styleUrl: './profile-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.banner--frozen]': 'isStatic()' },
})
export class ProfileBannerComponent {
  readonly banner = input<string>(BANNER_NONE);

  readonly isStatic = input(false);

  protected readonly isAurora = computed(() => this.banner() === BANNER_AURORA);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private ctx: CanvasRenderingContext2D | null = null;

  private scene: CosmicScene | null = null;

  private colors: CosmicColors | null = null;

  private size: Size = { width: 0, height: 0 };

  private rafId = 0;

  private observer: ResizeObserver | null = null;

  private isReady = false;


  /**
   * Sets the scene up after the first render and tears the loop/observer down
   * on destroy; re-seeds whenever the selected banner changes.
   */
  constructor() {
    afterNextRender(() => this.start());
    effect(() => {
      const id = this.banner();
      if (this.isReady) this.reseed(id);
    });
    inject(DestroyRef).onDestroy(() => this.teardown());
  }


  /**
   * First-time setup: size the canvas, watch resizes, seed and render.
   */
  private start(): void {
    this.prepare();
    this.observe();
    this.isReady = true;
    this.reseed(this.banner());
  }


  /**
   * Sizes the backing store to the element at a capped device pixel ratio and
   * caches the context, palette and CSS size.
   */
  private prepare(): void {
    const element = this.canvas().nativeElement;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.size = { width: element.clientWidth, height: element.clientHeight };
    element.width = Math.max(1, Math.floor(this.size.width * dpr));
    element.height = Math.max(1, Math.floor(this.size.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx = ctx;
    this.colors = resolveColors();
  }


  /**
   * Re-seeds the scene for a banner id and (re)starts rendering.
   * @param id Banner id whose preset params seed the scene.
   */
  private reseed(id: string): void {
    if (!this.ctx) return;
    this.scene = createScene(this.size.width, this.size.height, cosmicParams(id));
    this.render();
  }


  /**
   * Renders the scene: a single static frame for thumbnails or reduced motion,
   * otherwise the animation loop.
   */
  private render(): void {
    cancelAnimationFrame(this.rafId);
    if (this.isStatic() || prefersReducedMotion()) {
      this.draw(STATIC_TIME);
      return;
    }
    this.frame(performance.now());
  }


  /**
   * Draws one frame at the given timestamp.
   * @param time Animation timestamp in ms.
   */
  private draw(time: number): void {
    if (this.ctx && this.scene && this.colors) {
      drawFrame(this.ctx, this.scene, this.colors, time, prefersReducedTransparency());
    }
  }


  /**
   * Animation loop: draws a frame and schedules the next.
   * @param time Animation timestamp in ms.
   */
  private frame(time: number): void {
    this.draw(time);
    this.rafId = requestAnimationFrame(next => this.frame(next));
  }


  /**
   * Watches the canvas box so the scene re-fits on resize (e.g. down to 320px);
   * the observer's initial callback is skipped since start() already fitted.
   */
  private observe(): void {
    let isInitial = true;
    this.observer = new ResizeObserver(() => {
      if (isInitial) isInitial = false;
      else this.onResize();
    });
    this.observer.observe(this.canvas().nativeElement);
  }


  /**
   * Re-fits the canvas and scene to the new element size.
   */
  private onResize(): void {
    this.prepare();
    this.reseed(this.banner());
  }


  /**
   * Stops the loop and disconnects the resize observer.
   */
  private teardown(): void {
    cancelAnimationFrame(this.rafId);
    this.observer?.disconnect();
  }
}


/**
 * Whether the user prefers reduced motion (⇒ a single static frame).
 */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}


/**
 * Whether the user prefers reduced transparency (⇒ the glow is toned down).
 */
function prefersReducedTransparency(): boolean {
  return window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
}
