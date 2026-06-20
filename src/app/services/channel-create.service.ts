/**
 * @file Shared open-state for the "Channel erstellen" dialog.
 */
import { Injectable, signal } from '@angular/core';

/**
 * Holds whether the channel-creation dialog is open. The dialog is triggered
 * from the workspace menu but rendered by the app shell at the top level:
 * the sidebar column uses a frosted-glass `backdrop-filter`, which creates a
 * containing block for `position: fixed` and would otherwise clip the modal
 * overlay into the sidebar instead of centering it in the viewport.
 */
@Injectable({ providedIn: 'root' })
export class ChannelCreateService {
  /** Whether the channel-creation dialog is currently open. */
  readonly isOpen = signal(false);


  /**
   * Opens the channel-creation dialog.
   */
  open(): void {
    this.isOpen.set(true);
  }


  /**
   * Closes the channel-creation dialog.
   */
  close(): void {
    this.isOpen.set(false);
  }
}
