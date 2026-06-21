/**
 * @file Global command-palette state plus the Cmd/Ctrl+K shortcut that opens
 * the keyboard-first quick switcher from anywhere in the app.
 */
import { Injectable, signal } from '@angular/core';

/**
 * Owns the open state of the command palette and installs the global
 * Cmd+K (mac) / Ctrl+K shortcut. The shortcut fires from anywhere, even
 * while an input is focused, and suppresses the browser default. The
 * overlay UI is lazy-loaded by the shell, so this service stays in the
 * initial bundle while the palette code does not.
 */
@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  private readonly openState = signal(false);

  readonly isOpen = this.openState.asReadonly();


  /**
   * Installs the document-level shortcut listener for the app lifetime.
   */
  constructor() {
    document.addEventListener('keydown', event => this.onKeydown(event));
  }


  /**
   * Opens the palette.
   */
  open(): void {
    this.openState.set(true);
  }


  /**
   * Closes the palette.
   */
  close(): void {
    this.openState.set(false);
  }


  /**
   * Toggles the palette on Cmd/Ctrl+K, suppressing the browser default
   * (e.g. the address-bar search) so only the palette reacts.
   * @param event Document keydown event.
   */
  private onKeydown(event: KeyboardEvent): void {
    if (!isPaletteShortcut(event)) return;
    event.preventDefault();
    this.openState.update(open => !open);
  }
}


/**
 * Reports whether a keydown is the palette shortcut: the platform command
 * key (Cmd or Ctrl) together with the "k" key.
 * @param event Keydown event to test.
 */
function isPaletteShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
}
