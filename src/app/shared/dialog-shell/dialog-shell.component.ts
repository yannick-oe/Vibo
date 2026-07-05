/**
 * @file Generic modal shell: scrim, focus trap, close behaviors and focus
 * restore for projected dialog content. In the mobile bottom-sheet mode the
 * card additionally supports pointer-driven swipe-to-dismiss (grabber, or
 * content pulled down while scrolled to top) — an addition to, never a
 * replacement of, Escape, the X button and the scrim tap. The grabber is
 * the guaranteed touch surface (touch-action: none); on content the
 * browser may claim the pan (pointercancel), which safely springs back.
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

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])';
const ANCHORED_BOTTOM_INSET_PX = 24;
const ANCHOR_GAP_PX = 8;
const ANCHOR_MIN_VIEWPORT_PX = 768;
const SWIPE_DISMISS_FRACTION = 0.33;
const SWIPE_FLICK_VELOCITY_PX_PER_MS = 0.6;
const DRAG_START_SLOP_PX = 8;
const GRABBER_SELECTOR = '.dialog-shell__grabber';
const SETTLE_DURATION_MS = 250;

/** Width preset of the dialog card, mapped to the Figma measurements. */
export type DialogSize = 'default' | 'members' | 'add-members' | 'profile' | 'menu' | 'search';

/** Viewport position a dialog card is anchored to (Figma prototype). */
export interface DialogAnchor {
  /** Top edge of the card in viewport pixels. */
  readonly top: number;
  /** Left edge for trigger-left-aligned cards. */
  readonly left?: number;
  /** Right inset for cards aligned with a reference right edge. */
  readonly right?: number;
}


/**
 * Builds the anchor docking a dialog below its trigger per the Figma
 * prototype; null on small viewports, where dialogs center instead.
 * @param trigger Element the dialog is anchored to.
 * @param align Left-align with the trigger or right-align with an edge.
 * @param edgeElement Element whose right edge right-aligned cards use;
 * defaults to the trigger itself.
 */
export function anchorBelow(
  trigger: HTMLElement,
  align: 'left' | 'right',
  edgeElement?: HTMLElement,
): DialogAnchor | null {
  if (window.innerWidth <= ANCHOR_MIN_VIEWPORT_PX) return null;
  const rect = trigger.getBoundingClientRect();
  const top = rect.bottom + ANCHOR_GAP_PX;
  if (align === 'left') return { top, left: rect.left };
  const edge = (edgeElement ?? trigger).getBoundingClientRect().right;
  return { top, right: window.innerWidth - edge };
}

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

  readonly hasLeftAnchor = computed(() => this.anchor()?.left !== undefined);

  readonly hasRightAnchor = computed(() => this.anchor()?.right !== undefined);

  readonly closed = output<void>();

  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');

  private readonly layoutService = inject(LayoutService);

  private readonly reducedMotion = inject(ReducedMotionService);

  protected readonly isDragging = signal(false);

  protected readonly isSettling = signal(false);

  private readonly dragOffset = signal<number | null>(null);

  protected readonly sheetTransform = computed(() => {
    const offset = this.dragOffset();
    return offset === null ? null : `translateY(${offset}px)`;
  });

  private dragEligible = false;

  private grabberDrag = false;

  private dragStartY = 0;

  private lastMoveY = 0;

  private lastMoveTime = 0;

  private velocity = 0;


  /**
   * Focuses the first focusable element once the dialog is rendered and
   * registers the non-passive touchmove guard that keeps eligible sheet
   * drags alive on real touch devices (Angular listeners are passive, so
   * they cannot prevent the browser from claiming the pan for scrolling).
   */
  ngAfterViewInit(): void {
    this.focusableElements()[0]?.focus();
    this.card().nativeElement.addEventListener('touchmove', this.onNativeTouchMove, {
      passive: false,
    });
  }


  /**
   * Returns focus to the element that opened the dialog and removes the
   * native touchmove guard.
   */
  ngOnDestroy(): void {
    this.card().nativeElement.removeEventListener('touchmove', this.onNativeTouchMove);
    this.previouslyFocused?.focus();
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
   * Limits an anchored card to the space between its top edge and the
   * bottom of the viewport; null while centered (styled via SCSS).
   */
  protected anchoredMaxHeight(): string | null {
    const anchor = this.anchor();
    if (!anchor) return null;
    return `calc(100dvh - ${anchor.top + ANCHORED_BOTTOM_INSET_PX}px)`;
  }


  /**
   * Keeps Tab and Shift+Tab cycling inside the dialog.
   * @param event Keydown event of the Tab key.
   */
  protected trapFocus(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    const focusables = this.focusableElements();
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }


  /**
   * Lists the currently visible focusable elements inside the card.
   */
  private focusableElements(): HTMLElement[] {
    const elements = this.card().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    return [...elements].filter(element => element.offsetParent !== null);
  }


  /**
   * Starts tracking a potential swipe: only in sheet mode, and only when
   * the gesture begins on the grabber or on content scrolled to the top.
   * @param event Pointerdown event on the card.
   */
  protected onPointerDown(event: PointerEvent): void {
    if (!this.isSheetMode() || !event.isPrimary) return;
    const card = this.card().nativeElement;
    this.grabberDrag = this.isOnGrabber(event);
    this.dragEligible = this.grabberDrag || !this.hasScrolledContent(event.target, card);
    if (!this.dragEligible) return;
    this.dragStartY = event.clientY;
    this.lastMoveY = event.clientY;
    this.lastMoveTime = event.timeStamp;
    this.velocity = 0;
  }


  /**
   * Moves the sheet with a downward drag (clamped at its rest position).
   * The drag only engages beyond a small slop, so a tiny downward contact
   * roll at the start of an upward scroll never claims the gesture; an
   * upward move on content hands the gesture back to native scrolling.
   * @param event Pointermove event on the card.
   */
  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragEligible || !event.isPrimary) return;
    const delta = event.clientY - this.dragStartY;
    if (!this.isDragging()) {
      if (delta < 0) return this.abortUnlessGrabber(delta);
      if (delta <= DRAG_START_SLOP_PX) return;
      this.beginDrag(event);
    }
    this.trackVelocity(event);
    this.dragOffset.set(Math.max(0, delta - DRAG_START_SLOP_PX));
  }


  /**
   * Settles the released sheet: dismiss beyond the distance threshold or
   * on a fast downward flick, otherwise spring back.
   */
  protected onPointerUp(): void {
    if (!this.isDragging()) return this.resetDragTracking();
    const offset = this.dragOffset() ?? 0;
    const height = this.card().nativeElement.offsetHeight;
    const dismiss =
      offset > height * SWIPE_DISMISS_FRACTION || this.velocity > SWIPE_FLICK_VELOCITY_PX_PER_MS;
    this.settle(dismiss, height);
  }


  /**
   * Springs back when the browser takes over the pointer (e.g. scrolling).
   */
  protected onPointerCancel(): void {
    if (this.isDragging()) return this.settle(false, this.card().nativeElement.offsetHeight);
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
   * Whether the gesture started on the grabber element itself. A geometric
   * zone is deliberately not used: it would claim touches on adjacent card
   * content (especially once the card is scrolled) and deaden scrolling.
   * @param event Pointerdown event.
   */
  private isOnGrabber(event: PointerEvent): boolean {
    const target = event.target instanceof HTMLElement ? event.target : null;
    return !!target?.closest(GRABBER_SELECTOR);
  }


  /**
   * Whether any scroll container between the event target and the card is
   * scrolled away from the top (then the gesture belongs to scrolling).
   * @param target Element the gesture started on.
   * @param card Sheet card element.
   */
  private hasScrolledContent(target: EventTarget | null, card: HTMLElement): boolean {
    let node = target instanceof HTMLElement ? target : null;
    while (node && node !== card.parentElement) {
      if (node.scrollTop > 0) return true;
      node = node.parentElement;
    }
    return false;
  }


  /**
   * Drops the drag eligibility when content moves upward without the
   * grabber, so inner scrolling is never hijacked.
   * @param delta Vertical distance from the start position.
   */
  private abortUnlessGrabber(delta: number): void {
    if (!this.grabberDrag && delta < 0) this.dragEligible = false;
  }


  /**
   * Activates the visual drag and captures the pointer on the card.
   * @param event First downward pointermove of the gesture.
   */
  private beginDrag(event: PointerEvent): void {
    this.isDragging.set(true);
    this.isSettling.set(false);
    this.card().nativeElement.setPointerCapture(event.pointerId);
  }


  /**
   * Tracks the current downward velocity in pixels per millisecond.
   * @param event Latest pointermove event.
   */
  private trackVelocity(event: PointerEvent): void {
    const elapsed = event.timeStamp - this.lastMoveTime;
    if (elapsed > 0) this.velocity = (event.clientY - this.lastMoveY) / elapsed;
    this.lastMoveY = event.clientY;
    this.lastMoveTime = event.timeStamp;
  }


  /**
   * Animates the sheet off-screen (dismiss) or back to rest; with reduced
   * motion both states apply instantly without a transition.
   * @param dismiss Whether the sheet is dismissed.
   * @param height Current sheet height in pixels.
   */
  private settle(dismiss: boolean, height: number): void {
    this.isDragging.set(false);
    this.resetDragTracking();
    if (this.reducedMotion.prefersReducedMotion()) return this.finishSettle(dismiss);
    this.isSettling.set(true);
    this.dragOffset.set(dismiss ? height : 0);
    setTimeout(() => this.finishSettle(dismiss), SETTLE_DURATION_MS);
  }


  /**
   * Clears the settle state and emits the close event of a dismissal.
   * @param dismiss Whether the sheet was dismissed.
   */
  private finishSettle(dismiss: boolean): void {
    this.isSettling.set(false);
    this.dragOffset.set(null);
    if (dismiss) this.closed.emit();
  }


  /**
   * Resets the per-gesture tracking flags.
   */
  private resetDragTracking(): void {
    this.dragEligible = false;
    this.grabberDrag = false;
  }
}
