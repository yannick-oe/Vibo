/**
 * @file Generic modal shell: scrim, focus trap, close behaviors and focus
 * restore for projected dialog content.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  input,
  output,
  viewChild,
} from '@angular/core';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])';
const ANCHORED_BOTTOM_INSET_PX = 24;
const ANCHOR_GAP_PX = 8;
const ANCHOR_MIN_VIEWPORT_PX = 768;

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

  readonly closed = output<void>();

  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');


  /**
   * Focuses the first focusable element once the dialog is rendered.
   */
  ngAfterViewInit(): void {
    this.focusableElements()[0]?.focus();
  }


  /**
   * Returns focus to the element that opened the dialog.
   */
  ngOnDestroy(): void {
    this.previouslyFocused?.focus();
  }


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
}
