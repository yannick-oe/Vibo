/**
 * @file Focus helpers of the dialog shell: listing the visible focusable
 * elements of the card and keeping Tab focus cycling inside it.
 */

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])';


/**
 * Lists the currently visible focusable elements inside the card.
 * @param card Dialog card element.
 */
export function focusableElementsIn(card: HTMLElement): HTMLElement[] {
  const elements = card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  return [...elements].filter(element => element.offsetParent !== null);
}


/**
 * Keeps Tab and Shift+Tab cycling inside the dialog card.
 * @param event Keydown event of the Tab key.
 * @param card Dialog card element.
 */
export function trapFocusWithin(event: Event, card: HTMLElement): void {
  if (!(event instanceof KeyboardEvent)) return;
  const focusables = focusableElementsIn(card);
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
