/**
 * @file Generic modal shell: scrim, focus trap, close behaviors and focus
 * restore for projected dialog content. On open the shell hoists its host
 * element to document.body: the overlay is position: fixed, and an ancestor
 * with a backdrop-filter or transform (any glass dialog card) would otherwise
 * become its containing block, so a shell nested inside another dialog would
 * interpret its viewport anchor coordinates relative to that card and vanish
 * into its overflow clip. On destroy the shell removes its hoisted host
 * again — Angular only detaches the root nodes of a destroyed view, never a
 * node that was re-parented out of it — so a closed shell always leaves
 * document.body regardless of whether it closed itself or its parent was
 * torn down. Escape closes only the top-most open shell, so
 * nested dialogs unwind one level at a time. In the mobile bottom-sheet mode
 * the anchor is ignored entirely — the sheet pins to the viewport bottom and
 * its rest position derives only from the sheet model — and the card supports
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

/** Open shells in opening order; only the last one reacts to Escape. */
const OPEN_SHELLS: DialogShellComponent[] = [];

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
    '(document:keydown.escape)': 'onEscape()',
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

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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

  private readonly entranceReleased = signal(false);

  private readonly animatesDetentEntrance = computed(
    () =>
      this.detents() && this.isSheetMode() && !this.reducedMotion.prefersReducedMotion(),
  );

  protected readonly detentPending = computed(
    () => this.animatesDetentEntrance() && !this.entranceReleased(),
  );

  protected readonly detentEntering = computed(
    () => this.animatesDetentEntrance() && this.entranceReleased(),
  );

  protected readonly detentTall = computed(() => this.drag.currentDetent() === 'tall');

  private suppressesScrollbars = false;


  /**
   * Hoists the overlay to document.body (escaping any filtered/transformed
   * ancestor that would hijack its fixed positioning), registers on the
   * open-shell stack, locks background scrolling (suppressing background
   * scrollbars under a visible scrim), resolves the anchor's vertical side
   * (outside sheet mode only — the sheet never follows an anchor), focuses
   * the first focusable element once the dialog is rendered (without
   * scrolling — the first focusable sits at the top of the content, and a
   * focus-scroll against the mid-entrance geometry lands on garbage
   * offsets in scrollable cards), attaches the drag controller's native
   * listeners and schedules the detent entrance.
   */
  ngAfterViewInit(): void {
    document.body.appendChild(this.host.nativeElement);
    OPEN_SHELLS.push(this);
    this.suppressesScrollbars = this.isSheetMode() || this.scrim() === 'visible';
    this.scrollLock.lock(this.suppressesScrollbars);
    const anchor = this.anchor();
    if (anchor && !this.isSheetMode()) {
      this.placedAnchor.set(placeVertically(anchor, this.card().nativeElement.offsetHeight));
    }
    focusableElementsIn(this.card().nativeElement)[0]?.focus({ preventScroll: true });
    this.drag.attach();
    this.releaseEntranceAfterPaint();
  }


  /**
   * Releases the detent entrance gate two animation frames after the first
   * render: the first frame paints the parked card with the measured offset
   * bound, the second starts the entrance keyframe toward the CSS-owned
   * half rest. Correctness never depends on this sequencing — the idle rest
   * is a static CSS expression — the gate only keeps the entrance run clean.
   */
  private releaseEntranceAfterPaint(): void {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => this.entranceReleased.set(true)),
    );
  }


  /**
   * Deregisters from the open-shell stack, releases the scroll lock, detaches
   * the drag controller, removes the hoisted host element from document.body
   * and restores focus. The explicit removal is the teardown counterpart of
   * the open-time hoist: Angular detaches only the root nodes of a destroyed
   * view, so a shell hoisted out of a wrapper dialog's subtree would otherwise
   * stay attached to the body forever and resurface fully styled as soon as
   * the next shell instance re-injects the component stylesheet. Removing an
   * already-detached node is a no-op, so every destroy path — close event,
   * parent teardown, route change — tears down idempotently.
   */
  ngOnDestroy(): void {
    const stackIndex = OPEN_SHELLS.indexOf(this);
    if (stackIndex >= 0) OPEN_SHELLS.splice(stackIndex, 1);
    this.scrollLock.unlock(this.suppressesScrollbars);
    this.drag.detach();
    this.host.nativeElement.remove();
    this.restoreFocus();
  }


  /**
   * Closes the dialog on Escape, but only while it is the top-most open
   * shell, so a nested dialog (e.g. a menu inside the profile dialog)
   * closes alone and keeps its parent open.
   */
  protected onEscape(): void {
    if (OPEN_SHELLS.at(-1) === this) this.closed.emit();
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
