/**
 * @file Viewport layout state: mobile (separate full-screen views) versus
 * desktop (three-column shell).
 */
import { Injectable, signal } from '@angular/core';

const MOBILE_MEDIA_QUERY = '(max-width: 992px)';

/**
 * Exposes whether the viewport is below the mobile breakpoint (mirrors
 * the SCSS $breakpoint-md token) as a live signal.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly mobileState = signal(window.matchMedia(MOBILE_MEDIA_QUERY).matches);

  readonly isMobile = this.mobileState.asReadonly();


  /**
   * Subscribes to viewport changes for the lifetime of the app.
   */
  constructor() {
    const media = window.matchMedia(MOBILE_MEDIA_QUERY);
    media.addEventListener('change', event => this.mobileState.set(event.matches));
  }
}
