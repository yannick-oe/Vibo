/**
 * @file Scroll-to-latest state for a chat scroll region. Holds the geometry the
 * host's scroll handler feeds it and derives two things the floating "jump to
 * latest" button binds: whether it should show (scrolled up beyond one viewport
 * or unseen messages have arrived) and how many messages arrived while the user
 * was away from the bottom. Lives as a plain field on the owning list/thread and
 * is re-opened on every context switch, mirroring the entrance tracker.
 */
import { computed, signal } from '@angular/core';

const SCROLL_UP_EPSILON_PX = 8;

/**
 * Per-context scroll-to-latest gate. "Caught up" is driven by the host's
 * existing stick-to-bottom truth, so the freshly loaded history never counts as
 * arrivals and the badge clears exactly when the list auto-scrolls.
 */
export class ScrollFabTracker {
  private readonly distance = signal(0);

  private readonly viewport = signal(0);

  private readonly total = signal(0);

  private readonly seen = signal(0);

  private readonly suppressed = signal(false);

  readonly count = computed(() => Math.max(0, this.total() - this.seen()));

  readonly visible = computed(() => this.deriveVisible());


  /**
   * Feeds fresh scroll geometry from the host's scroll handler; reaching the
   * bottom marks every current message as seen.
   * @param distance Pixels between the scroll position and the bottom.
   * @param viewport Height of the scroll viewport in pixels.
   * @param atBottom Whether the host counts this as sticking to the bottom.
   */
  onScroll(distance: number, viewport: number, atBottom: boolean): void {
    const previous = this.distance();
    this.distance.set(distance);
    this.viewport.set(viewport);
    if (atBottom) {
      this.seen.set(this.total());
      this.suppressed.set(false);
    } else if (distance > previous + SCROLL_UP_EPSILON_PX) {
      this.suppressed.set(false);
    }
  }


  /**
   * Records the current message count; while the host sticks to the bottom the
   * user is looking at the latest, so all messages count as seen.
   * @param total Current number of messages in the region.
   * @param atBottom Whether the host counts this as sticking to the bottom.
   */
  sync(total: number, atBottom: boolean): void {
    this.total.set(total);
    if (atBottom) this.seen.set(total);
  }


  /**
   * Suppresses the button from a jump to the bottom until the scroll settles,
   * so it hides at once and does not flash back during the smooth animation;
   * onScroll lifts the suppression on arrival or on a genuine scroll back up.
   * The caller passes the current distance so the first descent frame is not
   * mistaken for a scroll back up (the tracked distance can be stale when
   * messages appended below the fold without a scroll event).
   * @param distance Current pixels between the scroll position and the bottom.
   */
  markCaughtUp(distance: number): void {
    this.seen.set(this.total());
    this.distance.set(distance);
    this.suppressed.set(true);
  }


  /**
   * Resets on context open: no geometry, nothing arrived, the initial history
   * counts as already seen.
   */
  open(): void {
    this.distance.set(0);
    this.viewport.set(0);
    this.total.set(0);
    this.seen.set(0);
    this.suppressed.set(false);
  }


  /**
   * Shows the button once the user has scrolled up past one viewport, or as
   * soon as any unseen message has arrived below; hidden while suppressed by a
   * jump in progress.
   */
  private deriveVisible(): boolean {
    if (this.suppressed()) return false;
    const beyondViewport = this.viewport() > 0 && this.distance() > this.viewport();
    return beyondViewport || this.count() > 0;
  }
}
