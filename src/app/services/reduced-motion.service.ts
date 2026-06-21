/**
 * @file Motion-related media preferences (reduced motion and hover capability)
 * exposed as live signals.
 */
import { Injectable, WritableSignal, signal } from '@angular/core';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const HOVER_CAPABLE_QUERY = '(hover: hover) and (pointer: fine)';

/**
 * Exposes the user's reduced-motion preference and whether the device is
 * hover-capable (fine pointer) as live signals, each kept in sync with the
 * OS/browser setting through its media query's change event.
 */
@Injectable({ providedIn: 'root' })
export class ReducedMotionService {
  private readonly reducedState = signal(window.matchMedia(REDUCED_MOTION_QUERY).matches);

  private readonly hoverState = signal(window.matchMedia(HOVER_CAPABLE_QUERY).matches);

  readonly prefersReducedMotion = this.reducedState.asReadonly();

  readonly isHoverCapable = this.hoverState.asReadonly();


  /**
   * Subscribes to both media queries for the lifetime of the app.
   */
  constructor() {
    this.track(REDUCED_MOTION_QUERY, this.reducedState);
    this.track(HOVER_CAPABLE_QUERY, this.hoverState);
  }


  /**
   * Mirrors a media query's match state into a signal on every change.
   * @param query Media query string to observe.
   * @param state Signal updated with the query's match state.
   */
  private track(query: string, state: WritableSignal<boolean>): void {
    const media = window.matchMedia(query);
    media.addEventListener('change', event => state.set(event.matches));
  }
}
