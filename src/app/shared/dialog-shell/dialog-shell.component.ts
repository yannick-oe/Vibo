/**
 * @file Generic modal shell: scrim, focus trap, close behaviors and focus
 * restore for projected dialog content. In the mobile bottom-sheet mode the
 * card additionally supports pointer-driven swipe-to-dismiss (grabber, or
 * content pulled down while scrolled to top) — an addition to, never a
 * replacement of, Escape, the X button and the scrim tap. While dragging,
 * the sheet follows the finger 1:1 with rubber-band resistance above the
 * rest position and the scrim opacity coupled to the progress; the release
 * velocity feeds the settle animation so motion continues seamlessly from
 * the release point. The grabber is the guaranteed touch surface
 * (touch-action: none); on content the browser may claim the pan
 * (pointercancel), which safely springs back.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { LayoutService } from '../../services/layout.service';
import { ReducedMotionService } from '../../services/reduced-motion.service';
import { ScrollLockService } from './scroll-lock.service';
import { DialogAnchor, DialogSize, anchoredMaxHeightStyle, placeVertically } from './dialog-anchor';
import { focusableElementsIn, trapFocusWithin } from './dialog-focus';
import {
  DRAG_START_SLOP_PX,
  VELOCITY_STALE_MS,
  dragOffsetFor,
  hasScrolledContent,
  isActiveTextEntry,
  isOnGrabber,
  readTranslateY,
  scrimOpacityFor,
  settleDurationMs,
  shouldDismiss,
  smoothedVelocity,
} from './sheet-physics';

const FOCUS_FALLBACK_SELECTOR = 'h1[tabindex="-1"]';

export { anchorBelow } from './dialog-anchor';
export type { DialogAnchor, DialogSize } from './dialog-anchor';

/**
 * Modal wrapper shared by the channel-management dialogs: renders the
 * scrim and the card, traps Tab focus, closes on Escape and on clicks on
 * the scrim, focuses the first focusable element on open and returns
 * focus to the opening element on destroy. With an anchor the card docks
 * below its trigger (squared corner towards it) instead of centering.
 */
@Component({
  selector: 'app-dialog-shell',
  templateUrl: './dialog-shell.component.html',
  styleUrl: './dialog-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
})
export class DialogShellComponent implements AfterViewInit, OnDestroy {
  readonly labelledBy = input.required<string>();

  readonly describedBy = input<string | null>(null);

  readonly size = input<DialogSize>('default');

  readonly anchor = input<DialogAnchor | null>(null);

  readonly scrim = input<'visible' | 'transparent'>('visible');

  private readonly placedAnchor = signal<DialogAnchor | null>(null);

  protected readonly activeAnchor = computed(() => this.placedAnchor() ?? this.anchor());

  protected readonly anchoredMaxHeight = computed(() => anchoredMaxHeightStyle(this.activeAnchor()));

  readonly closed = output<void>();

  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');

  private readonly layoutService = inject(LayoutService);

  private readonly reducedMotion = inject(ReducedMotionService);

  private readonly scrollLock = inject(ScrollLockService);

  protected readonly isDragging = signal(false);

  protected readonly isSettling = signal(false);

  protected readonly hasDragged = signal(false);

  private readonly dragOffset = signal<number | null>(null);

  private readonly settleMs = signal(0);

  protected readonly sheetTransform = computed(() => {
    const offset = this.dragOffset();
    return offset === null ? null : `translateY(${offset}px)`;
  });

  protected readonly settleDurationStyle = computed(() =>
    this.isSettling() ? `${this.settleMs()}ms` : null,
  );

  protected readonly scrimOpacity = computed(() => {
    const offset = this.dragOffset();
    return offset === null ? null : String(scrimOpacityFor(offset, this.sheetHeight));
  });

  private dragEligible = false;

  private grabberDrag = false;

  private dragStartY = 0;

  private dragBaseOffset = 0;

  private sheetHeight = 0;

  private lastMoveY = 0;

  private lastMoveTime = 0;

  private velocity = 0;

  private settleTimer: ReturnType<typeof setTimeout> | null = null;


  /**
   * Locks background scrolling, focuses the first focusable element once the
   * dialog is rendered and registers the non-passive touchmove guard that
   * keeps eligible sheet drags alive on real touch devices (Angular listeners
   * are passive, so they cannot prevent the browser from claiming the pan).
   */
  ngAfterViewInit(): void {
    this.scrollLock.lock();
    const anchor = this.anchor();
    if (anchor) this.placedAnchor.set(placeVertically(anchor, this.card().nativeElement.offsetHeight));
    focusableElementsIn(this.card().nativeElement)[0]?.focus();
    this.card().nativeElement.addEventListener('touchmove', this.onNativeTouchMove, {
      passive: false,
    });
  }


  /**
   * Releases the scroll lock, removes the native touchmove guard, drops a
   * still-pending settle timer and restores focus.
   */
  ngOnDestroy(): void {
    this.scrollLock.unlock();
    this.clearSettleTimer();
    this.card().nativeElement.removeEventListener('touchmove', this.onNativeTouchMove);
    this.restoreFocus();
  }


  /**
   * Returns focus to the element that opened the dialog; if that element
   * left the DOM while the dialog was open (live lists), the view's
   * programmatically focusable heading keeps the keyboard position.
   */
  private restoreFocus(): void {
    if (this.previouslyFocused?.isConnected) return this.previouslyFocused.focus();
    document.querySelector<HTMLElement>(FOCUS_FALLBACK_SELECTOR)?.focus();
  }


  /**
   * Prevents the browser from turning an eligible sheet drag into a native
   * scroll (which would fire pointercancel mid-drag): only downward moves
   * of an eligible gesture and moves of an active drag are consumed; every
   * upward move stays untouched so inner scrolling is never hijacked.
   * @param event Native touchmove event on the card.
   */
  private readonly onNativeTouchMove = (event: TouchEvent): void => {
    if (!this.dragEligible && !this.isDragging()) return;
    if (!event.cancelable) return;
    const y = event.touches[0]?.clientY ?? this.dragStartY;
    if (this.isDragging() || y > this.dragStartY) event.preventDefault();
  };


  /**
   * Closes the dialog when the click lands on the scrim itself.
   * @param event Click event on the overlay.
   */
  protected onOverlayClick(event: Event): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }


  /**
   * Keeps Tab and Shift+Tab cycling inside the dialog.
   * @param event Keydown event of the Tab key.
   */
  protected trapFocus(event: Event): void {
    trapFocusWithin(event, this.card().nativeElement);
  }


  /**
   * Starts tracking a potential swipe: only in sheet mode, and only when
   * the gesture begins on the grabber or on content that is neither
   * scrolled away from the top nor a focused text field (there a vertical
   * drag means text selection).
   * @param event Pointerdown event on the card.
   */
  protected onPointerDown(event: PointerEvent): void {
    if (!this.isSheetMode() || !event.isPrimary) return;
    const card = this.card().nativeElement;
    this.grabberDrag = isOnGrabber(event);
    this.dragEligible =
      this.grabberDrag ||
      (!hasScrolledContent(event.target, card) && !isActiveTextEntry(event.target));
    if (!this.dragEligible) return;
    this.dragStartY = event.clientY;
    this.lastMoveY = event.clientY;
    this.lastMoveTime = event.timeStamp;
    this.velocity = 0;
  }


  /**
   * Moves the sheet with the finger 1:1: downward unbounded, upward with
   * rubber-band resistance. Movement is measured from the engagement
   * anchor, so there is no jump when the drag engages.
   * @param event Pointermove event on the card.
   */
  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragEligible || !event.isPrimary) return;
    if (!this.isDragging() && !this.tryBeginDrag(event)) return;
    this.trackVelocity(event);
    this.dragOffset.set(dragOffsetFor(this.dragBaseOffset + event.clientY - this.dragStartY));
  }


  /**
   * Settles the released sheet: dismiss beyond the distance threshold or
   * on a fresh downward flick, otherwise spring back. A flick velocity
   * older than the staleness cutoff is discarded — the user stopped and
   * held before lifting, so only the distance threshold decides.
   * @param event Pointerup event on the card.
   */
  protected onPointerUp(event: PointerEvent): void {
    if (!event.isPrimary) return;
    if (!this.isDragging()) return this.resetDragTracking();
    if (event.timeStamp - this.lastMoveTime > VELOCITY_STALE_MS) this.velocity = 0;
    const offset = this.dragOffset() ?? 0;
    this.settle(shouldDismiss(offset, this.sheetHeight, this.velocity));
  }


  /**
   * Springs back when the browser takes over the pointer (e.g. scrolling).
   * @param event Pointercancel event on the card.
   */
  protected onPointerCancel(event: PointerEvent): void {
    if (!event.isPrimary) return;
    if (this.isDragging()) return this.settle(false);
    this.resetDragTracking();
  }


  /**
   * Whether the card currently renders as a mobile bottom sheet; the
   * full-screen search variant has no sheet gesture.
   */
  private isSheetMode(): boolean {
    return this.layoutService.isMobile() && this.size() !== 'search';
  }


  /**
   * Engages the drag once the gesture moved past the slop: downward from
   * anywhere eligible, upward only from the grabber (on content an upward
   * move hands the gesture back to native scrolling).
   * @param event Latest pointermove event of the gesture.
   */
  private tryBeginDrag(event: PointerEvent): boolean {
    const delta = event.clientY - this.dragStartY;
    if (delta < 0 && !this.grabberDrag) {
      this.dragEligible = false;
      return false;
    }
    if (Math.abs(delta) <= DRAG_START_SLOP_PX) return false;
    this.beginDrag(event);
    return true;
  }


  /**
   * Activates the visual drag: caches the sheet height (no layout reads
   * per move), re-anchors the gesture at the engagement point, catches a
   * mid-settle or mid-entrance sheet at its rendered position (computed
   * style reflects both the transition and the entrance animation) and
   * captures the pointer.
   * @param event Pointermove event that crossed the slop.
   */
  private beginDrag(event: PointerEvent): void {
    const card = this.card().nativeElement;
    this.clearSettleTimer();
    this.dragBaseOffset = readTranslateY(card);
    this.sheetHeight = card.offsetHeight;
    this.dragStartY = event.clientY;
    this.isDragging.set(true);
    this.isSettling.set(false);
    this.hasDragged.set(true);
    card.setPointerCapture(event.pointerId);
  }


  /**
   * Tracks the smoothed downward velocity in pixels per millisecond.
   * @param event Latest pointermove event.
   */
  private trackVelocity(event: PointerEvent): void {
    const elapsed = event.timeStamp - this.lastMoveTime;
    if (elapsed > 0) {
      const instantaneous = (event.clientY - this.lastMoveY) / elapsed;
      this.velocity = smoothedVelocity(this.velocity, instantaneous);
    }
    this.lastMoveY = event.clientY;
    this.lastMoveTime = event.timeStamp;
  }


  /**
   * Animates the sheet off-screen (dismiss) or back to rest over a
   * duration derived from the release velocity, so the animation continues
   * the finger's motion; with reduced motion both states apply instantly.
   * @param dismiss Whether the sheet is dismissed.
   */
  private settle(dismiss: boolean): void {
    this.isDragging.set(false);
    this.resetDragTracking();
    if (this.reducedMotion.prefersReducedMotion()) return this.finishSettle(dismiss);
    const duration = this.releaseDuration(dismiss);
    this.settleMs.set(duration);
    this.isSettling.set(true);
    this.dragOffset.set(dismiss ? this.sheetHeight : 0);
    this.settleTimer = setTimeout(() => this.finishSettle(dismiss), duration);
  }


  /**
   * Duration of the settle animation from the release point: remaining
   * distance over the release velocity (spring-backs use the fallback
   * speed), clamped by the named min/max constants.
   * @param dismiss Whether the sheet is dismissed.
   */
  private releaseDuration(dismiss: boolean): number {
    const offset = this.dragOffset() ?? 0;
    const remaining = dismiss ? this.sheetHeight - offset : offset;
    return settleDurationMs(remaining, dismiss ? this.velocity : 0);
  }


  /**
   * Clears the settle state and emits the close event of a dismissal.
   * @param dismiss Whether the sheet was dismissed.
   */
  private finishSettle(dismiss: boolean): void {
    this.clearSettleTimer();
    this.isSettling.set(false);
    this.dragOffset.set(null);
    if (dismiss) this.closed.emit();
  }


  /**
   * Cancels a scheduled settle completion, e.g. when a new drag catches
   * the sheet mid-settle.
   */
  private clearSettleTimer(): void {
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }


  /**
   * Resets the per-gesture tracking flags.
   */
  private resetDragTracking(): void {
    this.dragEligible = false;
    this.grabberDrag = false;
  }
}
