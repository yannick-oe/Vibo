/**
 * @file Last known pointer position, tracked via a single passive, throttled
 * document pointermove listener on hover-capable devices. Lets overlay close
 * paths re-evaluate true hover with a hit-test instead of relying on pointer
 * events that a scrim swallowed while the overlay was open.
 */
import { Injectable, inject } from '@angular/core';

import { LayoutService } from './layout.service';

const POINTER_TRACK_THROTTLE_MS = 50;

/**
 * Tracks the pointer's viewport coordinates app-wide and answers hit-tests
 * against them. Touch-only devices never register the listener; their
 * hit-tests report false so touch flows stay pointer-state-free.
 */
@Injectable({ providedIn: 'root' })
export class PointerPositionService {
  private readonly layoutService = inject(LayoutService);

  private lastX: number | null = null;

  private lastY: number | null = null;

  private lastRecordedAt = 0;


  /**
   * Registers the throttled document tracker once, only on devices with a
   * hover-capable pointer; the listener lives for the app's lifetime.
   */
  constructor() {
    if (!this.layoutService.isHoverCapable()) return;
    document.addEventListener('pointermove', event => this.record(event), { passive: true });
  }


  /**
   * Reports whether the last known pointer position lies inside the given
   * element (or its subtree); false while no position was recorded yet.
   * @param element Element to hit-test against.
   */
  isOver(element: HTMLElement): boolean {
    if (this.lastX === null || this.lastY === null) return false;
    const hit = document.elementFromPoint(this.lastX, this.lastY);
    return hit !== null && element.contains(hit);
  }


  /**
   * Records the pointer position, skipping events inside the throttle
   * window to keep the global listener cheap.
   * @param event Document-level pointermove event.
   */
  private record(event: PointerEvent): void {
    const now = performance.now();
    if (now - this.lastRecordedAt < POINTER_TRACK_THROTTLE_MS) return;
    this.lastRecordedAt = now;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
  }
}
