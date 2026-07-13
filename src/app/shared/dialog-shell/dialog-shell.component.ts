/**
 * @file Generic modal shell: scrim, focus trap, close behaviors and focus
 * restore for projected dialog content. In the mobile bottom-sheet mode the
 * anchor is ignored entirely — the sheet pins to the viewport bottom and its
 * rest position derives only from the sheet model — and the card supports
 * pointer-driven swipe gestures via the extracted drag controller:
 * swipe-to-dismiss on every sheet, plus half/tall detent snapping on sheets
 * flagged with `detents` (the pickers). Gestures are an addition to, never a
 * replacement of, Escape, the X button and the scrim tap.
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
import { SheetDragController } from './sheet-drag.controller';

const FOCUS_FALLBACK_SELECTOR = 'h1[tabindex="-1"]';

export { anchorBelow } from './dialog-anchor';
export type { DialogAnchor, DialogSize } from './dialog-anchor';

/**
 * Modal wrapper shared by the channel-management dialogs: renders the
 * scrim and the card, traps Tab focus, closes on Escape and on clicks on
 * the scrim, focuses the first focusable element on open and returns
 * focus to the opening element on destroy. With an anchor the card docks
 * below its trigger (squared corner towards it) instead of centering; in
 * sheet mode the anchor is ignored so placement is identical for every
 * trigger.
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

  readonly detents = input(false);

  readonly closed = output<void>();

  private readonly placedAnchor = signal<DialogAnchor | null>(null);

  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');

  private readonly layoutService = inject(LayoutService);

  private readonly reducedMotion = inject(ReducedMotionService);

  private readonly scrollLock = inject(ScrollLockService);

  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  private readonly isSheetMode = computed(
    () => this.layoutService.isMobile() && this.size() !== 'search',
  );

  protected readonly activeAnchor = computed(() =>
    this.isSheetMode() ? null : this.placedAnchor() ?? this.anchor(),
  );

  protected readonly anchoredMaxHeight = computed(() => anchoredMaxHeightStyle(this.activeAnchor()));

  protected readonly drag = new SheetDragController({
    card: () => this.card().nativeElement,
    isSheetMode: () => this.isSheetMode(),
    hasDetents: () => this.detents(),
    prefersReducedMotion: () => this.reducedMotion.prefersReducedMotion(),
    dismiss: () => this.closed.emit(),
  });


  /**
   * Locks background scrolling, resolves the anchor's vertical side (outside
   * sheet mode only — the sheet never follows an anchor), focuses the first
   * focusable element once the dialog is rendered and attaches the drag
   * controller's native listeners.
   */
  ngAfterViewInit(): void {
    this.scrollLock.lock();
    const anchor = this.anchor();
    if (anchor && !this.isSheetMode()) {
      this.placedAnchor.set(placeVertically(anchor, this.card().nativeElement.offsetHeight));
    }
    focusableElementsIn(this.card().nativeElement)[0]?.focus();
    this.drag.attach();
  }


  /**
   * Releases the scroll lock, detaches the drag controller and restores
   * focus.
   */
  ngOnDestroy(): void {
    this.scrollLock.unlock();
    this.drag.detach();
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
}
