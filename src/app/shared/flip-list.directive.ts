/**
 * @file FLIP reorder animation for a list whose rows carry a stable
 * `data-flip-id`. On each change of the bound list it measures the rows after
 * re-render (batched reads), then plays each moved row from its previous
 * position to the new one via the Web Animations API (compositor transform
 * only, no layout thrash); genuinely new rows fade + scale in. Reduced motion
 * is instant — the store is refreshed without animating.
 */
import { Directive, ElementRef, effect, inject, input } from '@angular/core';

import { ReducedMotionService } from '../services/reduced-motion.service';

const FLIP_SELECTOR = ':scope > [data-flip-id]';
const FLIP_DURATION_MS = 200;
const FLIP_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
const FADE_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: 'scale(0.96)' },
  { opacity: 1, transform: 'scale(1)' },
];

/** One row's post-render measurement. */
interface RowRect {
  readonly el: HTMLElement;
  readonly id: string;
  readonly top: number;
}

/**
 * Animates reorders of the direct-child rows inside the host list using FLIP.
 * Rows must carry a stable `data-flip-id`; the bound value is only a change
 * trigger — the order and positions are read back from the DOM after render.
 */
@Directive({ selector: '[appFlipList]' })
export class FlipListDirective {
  readonly appFlipList = input.required<readonly unknown[]>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private readonly reducedMotion = inject(ReducedMotionService);

  private readonly positions = new Map<string, number>();

  private primed = false;

  private lastOrder = '';


  /**
   * Schedules a FLIP pass after each re-render of the bound list.
   */
  constructor() {
    effect(() => {
      this.appFlipList();
      requestAnimationFrame(() => this.play(this.measure()));
    });
  }


  /**
   * Measures every row's viewport top in one batched read pass.
   */
  private measure(): RowRect[] {
    const rows = this.host.querySelectorAll<HTMLElement>(FLIP_SELECTOR);
    return Array.from(rows, el => ({
      el,
      id: el.dataset['flipId'] ?? '',
      top: el.getBoundingClientRect().top,
    }));
  }


  /**
   * Animates each row (FLIP for moved, fade for new), then prunes stored
   * positions of removed rows. The first pass only seeds the baseline so the
   * initial render is never mass-animated. Re-emissions that keep the row
   * order (presence heartbeats, metadata refreshes) only refresh the stored
   * baseline — they never run FLIP and never cancel an in-flight animation.
   * @param rects Freshly measured row rectangles.
   */
  private play(rects: RowRect[]): void {
    const order = rects.map(rect => rect.id).join(' ');
    const orderChanged = order !== this.lastOrder;
    this.lastOrder = order;
    const instant = !this.primed || this.reducedMotion.prefersReducedMotion();
    this.primed = true;
    if (!orderChanged) return this.refresh(rects);
    for (const rect of rects) this.animateRow(rect, instant);
    this.prune(rects);
  }


  /**
   * Stores the measured positions without animating, keeping the FLIP
   * baseline accurate across same-order re-renders. Rows with a running
   * animation are skipped — their measured top includes the in-flight
   * transform and would corrupt the baseline.
   * @param rects Freshly measured row rectangles.
   */
  private refresh(rects: RowRect[]): void {
    for (const rect of rects) {
      if (rect.el.getAnimations().length === 0) this.positions.set(rect.id, rect.top);
    }
    this.prune(rects);
  }


  /**
   * Plays one row and stores its new position: FLIP for a moved row, fade+scale
   * for a newly appeared one; nothing under reduced motion.
   * @param rect Row rectangle.
   * @param instant Whether reduced motion is active.
   */
  private animateRow(rect: RowRect, instant: boolean): void {
    const previous = this.positions.get(rect.id);
    this.positions.set(rect.id, rect.top);
    if (instant) return;
    rect.el.getAnimations().forEach(animation => animation.cancel());
    if (previous === undefined) this.fadeIn(rect.el);
    else this.flip(rect.el, previous - rect.top);
  }


  /**
   * Glides a row from its previous position (delta) to the new one.
   * @param el Row element.
   * @param delta Pixels from the new position back to the old.
   */
  private flip(el: HTMLElement, delta: number): void {
    if (!delta) return;
    el.animate(
      [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
      { duration: FLIP_DURATION_MS, easing: FLIP_EASING },
    );
  }


  /**
   * Fades and scales a newly appeared row in.
   * @param el Row element.
   */
  private fadeIn(el: HTMLElement): void {
    el.animate(FADE_KEYFRAMES, { duration: FLIP_DURATION_MS, easing: FLIP_EASING });
  }


  /**
   * Drops stored positions for rows that no longer exist.
   * @param rects Current row rectangles.
   */
  private prune(rects: RowRect[]): void {
    const ids = new Set(rects.map(rect => rect.id));
    for (const id of this.positions.keys()) {
      if (!ids.has(id)) this.positions.delete(id);
    }
  }
}
