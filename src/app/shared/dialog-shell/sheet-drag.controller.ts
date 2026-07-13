/**
 * @file Pointer-driven drag state machine of the dialog-shell bottom sheet:
 * gesture eligibility, 1:1 finger tracking with rubber-band overdrag and the
 * velocity-matched settle. Single-rest sheets spring back or dismiss; detent
 * sheets (the pickers) additionally snap between the half and tall rest
 * offsets, derived purely from the measured card height — never from an anchor.
 */
import { Signal, computed, signal } from '@angular/core';

import {
  DRAG_START_SLOP_PX,
  Detent,
  VELOCITY_STALE_MS,
  detentRestOffset,
  dragOffsetFor,
  hasScrolledContent,
  isActiveTextEntry,
  isOnGrabber,
  readTranslateY,
  resolveDetentRelease,
  scrimOpacityFor,
  settleDurationMs,
  shouldDismiss,
  smoothedVelocity,
} from './sheet-physics';

/** Callbacks wiring the drag controller to its owning dialog shell. */
export interface SheetDragHost {
  /** The sheet card element the gestures act on. */
  card(): HTMLElement;
  /** Whether the card currently renders as a mobile bottom sheet. */
  isSheetMode(): boolean;
  /** Whether the sheet snaps between the half and tall detents. */
  hasDetents(): boolean;
  /** Whether the user prefers reduced motion (settles apply instantly). */
  prefersReducedMotion(): boolean;
  /** Invoked when a drag dismisses the sheet. */
  dismiss(): void;
}

/**
 * Owns the drag lifecycle of one dialog-shell instance. The shell binds the
 * exposed signals to the card (transform, settle duration, scrim opacity)
 * and forwards its pointer events; `attach`/`detach` manage the native
 * touchmove guard, the resize re-measure and a pending settle timer.
 */
export class SheetDragController {
  readonly isDragging = signal(false);

  readonly isSettling = signal(false);

  readonly hasDragged = signal(false);

  readonly currentDetent = signal<Detent>('half');

  private readonly dragOffset = signal<number | null>(null);

  private readonly settleMs = signal(0);

  private readonly cardHeight = signal(0);

  readonly sheetTransform: Signal<string | null> = computed(() => {
    const offset = this.dragOffset() ?? this.idleOffset();
    return offset === null ? null : `translateY(${offset}px)`;
  });

  readonly settleDurationStyle: Signal<string | null> = computed(() =>
    this.isSettling() ? `${this.settleMs()}ms` : null,
  );

  readonly scrimOpacity: Signal<string | null> = computed(() => {
    const offset = this.dragOffset();
    if (offset === null) return null;
    return String(scrimOpacityFor(offset, this.cardHeight(), this.lowestRestOffset()));
  });

  readonly detentOffsetStyle: Signal<string | null> = computed(() => {
    const offset = this.idleOffset();
    return offset === null ? null : `${offset}px`;
  });

  private dragEligible = false;

  private grabberDrag = false;

  private dragStartY = 0;

  private dragBaseOffset = 0;

  private lastMoveY = 0;

  private lastMoveTime = 0;

  private velocity = 0;

  private settleTimer: ReturnType<typeof setTimeout> | null = null;


  /**
   * @param host Shell callbacks providing the card, mode flags and dismissal.
   */
  constructor(private readonly host: SheetDragHost) {}


  /**
   * Measures the card and registers the non-passive touchmove guard that
   * keeps eligible sheet drags alive on real touch devices (Angular
   * listeners are passive, so they cannot prevent the browser from claiming
   * the pan) plus the resize re-measure keeping detent offsets current.
   */
  attach(): void {
    this.measure();
    this.host.card().addEventListener('touchmove', this.onNativeTouchMove, { passive: false });
    window.addEventListener('resize', this.onResize);
  }


  /**
   * Removes the native listeners and drops a still-pending settle timer.
   */
  detach(): void {
    this.clearSettleTimer();
    this.host.card().removeEventListener('touchmove', this.onNativeTouchMove);
    window.removeEventListener('resize', this.onResize);
  }


  /**
   * Starts tracking a potential swipe: only in sheet mode, and only when
   * the gesture begins on the grabber or on content that is neither
   * scrolled away from the top nor a focused text field (there a vertical
   * drag means text selection).
   * @param event Pointerdown event on the card.
   */
  onPointerDown(event: PointerEvent): void {
    if (!this.host.isSheetMode() || !event.isPrimary) return;
    const card = this.host.card();
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
   * rubber-band resistance above the tall rest. Movement is measured from
   * the engagement anchor, so there is no jump when the drag engages.
   * @param event Pointermove event on the card.
   */
  onPointerMove(event: PointerEvent): void {
    if (!this.dragEligible || !event.isPrimary) return;
    if (!this.isDragging() && !this.tryBeginDrag(event)) return;
    this.trackVelocity(event);
    this.dragOffset.set(dragOffsetFor(this.dragBaseOffset + event.clientY - this.dragStartY));
  }


  /**
   * Settles the released sheet: single-rest sheets dismiss beyond the
   * distance threshold or on a fresh downward flick and spring back
   * otherwise; detent sheets resolve to half, tall or dismiss. A flick
   * velocity older than the staleness cutoff is discarded — the user
   * stopped and held before lifting, so only the position decides.
   * @param event Pointerup event on the card.
   */
  onPointerUp(event: PointerEvent): void {
    if (!event.isPrimary) return;
    if (!this.isDragging()) return this.resetDragTracking();
    if (event.timeStamp - this.lastMoveTime > VELOCITY_STALE_MS) this.velocity = 0;
    const offset = this.dragOffset() ?? 0;
    if (this.detentsActive()) return this.settleRelease(offset);
    this.settle(shouldDismiss(offset, this.cardHeight(), this.velocity));
  }


  /**
   * Springs back when the browser takes over the pointer (e.g. scrolling).
   * @param event Pointercancel event on the card.
   */
  onPointerCancel(event: PointerEvent): void {
    if (!event.isPrimary) return;
    if (this.isDragging()) return this.settle(false);
    this.resetDragTracking();
  }


  /**
   * Prevents the browser from turning an eligible sheet drag into a native
   * scroll (which would fire pointercancel mid-drag): active-drag moves,
   * eligible downward moves and — on a half-resting detent sheet — upward
   * moves are consumed; other upward moves keep inner scrolling intact.
   * @param event Native touchmove event on the card.
   */
  private readonly onNativeTouchMove = (event: TouchEvent): void => {
    if (!this.dragEligible && !this.isDragging()) return;
    if (!event.cancelable) return;
    const y = event.touches[0]?.clientY ?? this.dragStartY;
    if (this.isDragging() || y > this.dragStartY || this.allowsUpwardContentDrag()) {
      event.preventDefault();
    }
  };


  /**
   * Re-measures the card when the viewport changes (rotation, URL-bar
   * show/hide), keeping detent rest offsets aligned with the new height.
   */
  private readonly onResize = (): void => {
    this.measure();
  };


  /**
   * Caches the card height all offsets and thresholds derive from.
   */
  private measure(): void {
    this.cardHeight.set(this.host.card().offsetHeight);
  }


  /**
   * Whether the sheet currently snaps between detents (detent sheets in
   * sheet mode only; desktop popovers never translate).
   */
  private detentsActive(): boolean {
    return this.host.hasDetents() && this.host.isSheetMode();
  }


  /**
   * Whether an upward drag starting on the content may engage the sheet:
   * only on a detent sheet resting at half, where dragging up expands to
   * tall; at tall (and on single-rest sheets) upward pans belong to the
   * inner scroll.
   */
  private allowsUpwardContentDrag(): boolean {
    return this.detentsActive() && this.currentDetent() === 'half';
  }


  /**
   * The rest offset the sheet idles at: the current detent's offset for
   * active detent sheets, none otherwise (single-rest sheets lie at 0).
   */
  private idleOffset(): number | null {
    if (!this.detentsActive()) return null;
    const height = this.cardHeight();
    return height > 0 ? detentRestOffset(this.currentDetent(), height) : null;
  }


  /**
   * The lowest rest offset the scrim stays opaque above: the half-detent
   * offset for active detent sheets, 0 otherwise.
   */
  private lowestRestOffset(): number {
    return this.detentsActive() ? detentRestOffset('half', this.cardHeight()) : 0;
  }


  /**
   * Engages the drag once the gesture moved past the slop: downward from
   * anywhere eligible, upward from the grabber or — for half-resting detent
   * sheets — from content at scroll top (on all other content an upward
   * move hands the gesture back to native scrolling).
   * @param event Latest pointermove event of the gesture.
   */
  private tryBeginDrag(event: PointerEvent): boolean {
    const delta = event.clientY - this.dragStartY;
    if (delta < 0 && !this.grabberDrag && !this.allowsUpwardContentDrag()) {
      this.dragEligible = false;
      return false;
    }
    if (Math.abs(delta) <= DRAG_START_SLOP_PX) return false;
    this.beginDrag(event);
    return true;
  }


  /**
   * Activates the visual drag: re-measures the sheet (no layout reads per
   * move), re-anchors the gesture at the engagement point, catches a
   * mid-settle or mid-entrance sheet at its rendered position (computed
   * style reflects both the transition and the entrance animation) and
   * captures the pointer.
   * @param event Pointermove event that crossed the slop.
   */
  private beginDrag(event: PointerEvent): void {
    const card = this.host.card();
    this.clearSettleTimer();
    this.dragBaseOffset = readTranslateY(card);
    this.measure();
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
   * Resolves a detent sheet's release to its target and settles there:
   * dismissal reuses the shared settle, a detent snap updates the rest the
   * settle animation then lands on.
   * @param offset Sheet offset at release in pixels.
   */
  private settleRelease(offset: number): void {
    const release = resolveDetentRelease(offset, this.cardHeight(), this.velocity);
    if (release === 'dismiss') return this.settle(true);
    this.currentDetent.set(release);
    this.settle(false);
  }


  /**
   * Animates the sheet off-screen (dismiss) or to its rest offset over a
   * duration derived from the release velocity, so the animation continues
   * the finger's motion; with reduced motion both states apply instantly.
   * @param dismiss Whether the sheet is dismissed.
   */
  private settle(dismiss: boolean): void {
    this.isDragging.set(false);
    this.resetDragTracking();
    const target = dismiss ? this.cardHeight() : this.idleOffset() ?? 0;
    if (this.host.prefersReducedMotion()) return this.finishSettle(dismiss);
    const duration = this.releaseDuration(target);
    this.settleMs.set(duration);
    this.isSettling.set(true);
    this.dragOffset.set(target);
    this.settleTimer = setTimeout(() => this.finishSettle(dismiss), duration);
  }


  /**
   * Duration of the settle animation from the release point: remaining
   * distance over the release velocity when it points toward the target
   * (spring-backs against the motion use the fallback speed), clamped by
   * the named min/max constants.
   * @param target Offset the settle animation lands on.
   */
  private releaseDuration(target: number): number {
    const remaining = target - (this.dragOffset() ?? 0);
    const toward = Math.sign(remaining) === Math.sign(this.velocity) ? Math.abs(this.velocity) : 0;
    return settleDurationMs(remaining, toward);
  }


  /**
   * Clears the settle state and reports a dismissal to the shell. The drag
   * offset returns to null; detent sheets fall back to the idle rest offset
   * the settle just landed on, so the transform stays continuous.
   * @param dismiss Whether the sheet was dismissed.
   */
  private finishSettle(dismiss: boolean): void {
    this.clearSettleTimer();
    this.isSettling.set(false);
    this.dragOffset.set(null);
    if (dismiss) this.host.dismiss();
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
