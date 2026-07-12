/**
 * @file Older-page loading + scroll anchoring for the message list. Observes a
 * top sentinel to page older history in, and restores the scroll position after
 * a prepend so the viewport stays put (CLS 0) — anchored to the previous top
 * row's viewport position, not the scroll-height delta, so a message that
 * appends below the fold during the fetch cannot over-scroll it. Held as a plain
 * field on the message list, mirroring the entrance/big-reaction trackers.
 */
import { ConversationWindow } from '../../services/conversation-window';

const PREFETCH_MARGIN_PX = 300;

/**
 * Drives sentinel-triggered older-page loads and prepend scroll anchoring for a
 * message list, via accessors for its scroll container, window, stick-to-bottom
 * state and its current top (oldest visible) row id.
 */
export class MessagePager {
  private observer: IntersectionObserver | null = null;

  private anchor: { id: string; rectTop: number } | null = null;


  /**
   * @param scrollEl Accessor for the scroll container element.
   * @param window Accessor for the active conversation window.
   * @param atBottom Accessor for whether the list is stuck to the bottom.
   * @param topId Accessor for the current oldest visible message id.
   */
  constructor(
    private readonly scrollEl: () => HTMLElement | undefined,
    private readonly window: () => ConversationWindow,
    private readonly atBottom: () => boolean,
    private readonly topId: () => string | null,
  ) {}


  /**
   * (Re)observes the top sentinel so older pages load as it nears the viewport;
   * absent at the true start, which stops paging.
   * @param sentinel The sentinel element, or undefined at the start.
   */
  observe(sentinel: HTMLElement | undefined): void {
    this.observer?.disconnect();
    this.observer = null;
    const root = this.scrollEl();
    if (!sentinel || !root) return;
    this.observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) void this.requestOlder();
      },
      { root, rootMargin: `${PREFETCH_MARGIN_PX}px 0px 0px 0px` },
    );
    this.observer.observe(sentinel);
  }


  /**
   * Restores the scroll position after a prepend has landed (the top row id
   * changed), keeping the previous top row where it was on screen.
   * @param firstId Current oldest visible message id.
   */
  restore(firstId: string | null): void {
    const anchor = this.anchor;
    if (!anchor || firstId === anchor.id) return;
    this.anchor = null;
    requestAnimationFrame(() => {
      const element = this.scrollEl();
      if (element) element.scrollTop += anchorRectTop(anchor.id) - anchor.rectTop;
    });
  }


  /**
   * Clears any pending prepend anchor on a context switch. The observer stays
   * attached to the persistent sentinel (requestOlder always reads the current
   * window), so it must NOT be dropped here or paging would die when two large
   * conversations reuse the same sentinel element across the switch.
   */
  reset(): void {
    this.anchor = null;
  }


  /**
   * Disconnects the observer and clears the anchor; call on teardown.
   */
  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.anchor = null;
  }


  /**
   * Loads the next older page while reading history, capturing the top row's
   * position first so the prepend does not move the viewport. No-op at the
   * bottom or while already loading or at the start.
   */
  private async requestOlder(): Promise<void> {
    const window = this.window();
    if (!this.scrollEl() || this.atBottom() || window.atStart() || window.loadingOlder()) return;
    const firstId = this.topId();
    this.anchor = firstId ? { id: firstId, rectTop: anchorRectTop(firstId) } : null;
    await window.loadOlder();
  }
}


/**
 * Viewport-relative top of a message row, a stable scroll anchor across a
 * prepend; 0 when the row is not in the DOM.
 * @param id Firestore id of the anchor message.
 */
function anchorRectTop(id: string): number {
  return document.getElementById(`message-${id}`)?.getBoundingClientRect().top ?? 0;
}
