/**
 * @file Reference-counted background scroll lock for modal overlays. Uses the
 * fixed-body technique rather than `overflow: hidden` (which iOS Safari
 * ignores — the page still scrolls and rubber-bands behind the overlay): the
 * body is pinned at its current scroll offset while any overlay is open and
 * restored to that offset on release. A layout scrollbar's width is
 * compensated only when one actually exists (overlay scrollbars measure zero),
 * so locking never shifts the page horizontally.
 */
import { Injectable } from '@angular/core';

const FIXED = 'fixed';

const SCROLLBAR_SUPPRESS_CLASS = 'scrollbars-suppressed';

/**
 * Locks and restores background page scrolling for stacked overlays. Each open
 * overlay acquires the lock and releases it on close; the body is pinned only
 * while at least one overlay is open (reference-counted, so nested dialogs
 * restore the scroll position exactly once). Overlays with a visible scrim
 * additionally suppress the scrollbars of background scrollers: a class on
 * the document root paints them transparent via the
 * `scrollbar-suppressed-under-overlay` mixin — the gutter geometry stays, so
 * neither locking nor unlocking shifts layout.
 */
@Injectable({ providedIn: 'root' })
export class ScrollLockService {
  private locks = 0;

  private suppressLocks = 0;

  private scrollY = 0;


  /**
   * Acquires the lock. On the first concurrent overlay it pins the body at the
   * current scroll offset and pads the removed scrollbar's width; further
   * overlays only increment the reference count.
   * @param suppressScrollbars Whether this overlay also hides background
   * scrollbars (visible-scrim overlays and mobile sheets).
   */
  lock(suppressScrollbars = false): void {
    if (suppressScrollbars && this.suppressLocks++ === 0) {
      document.documentElement.classList.add(SCROLLBAR_SUPPRESS_CLASS);
    }
    if (this.locks++ > 0) return;
    this.scrollY = window.scrollY;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const body = document.body.style;
    body.position = FIXED;
    body.top = `${-this.scrollY}px`;
    body.insetInline = '0';
    if (scrollbar > 0) body.paddingRight = `${scrollbar}px`;
  }


  /**
   * Releases the lock. When the last overlay closes it clears the pinning
   * styles and restores the saved scroll offset; surplus releases are ignored
   * so a mismatched pair can never leave the page pinned.
   * @param suppressScrollbars The same flag the paired {@link lock} passed.
   */
  unlock(suppressScrollbars = false): void {
    if (suppressScrollbars && this.suppressLocks > 0 && --this.suppressLocks === 0) {
      document.documentElement.classList.remove(SCROLLBAR_SUPPRESS_CLASS);
    }
    if (this.locks === 0 || --this.locks > 0) return;
    const body = document.body.style;
    body.position = '';
    body.top = '';
    body.insetInline = '';
    body.paddingRight = '';
    window.scrollTo(0, this.scrollY);
  }
}
