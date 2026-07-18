/**
 * @file Shared open-state for the "Sprachkanal erstellen" dialog.
 */
import { Injectable, signal } from '@angular/core';

/**
 * Holds whether the voice-channel-creation dialog is open. Mirrors
 * {@link ChannelCreateService}: the dialog is triggered from the workspace
 * menu but rendered by the app shell at the top level, because the frosted
 * sidebar's `backdrop-filter` creates a containing block for
 * `position: fixed` and would clip the modal overlay into the sidebar.
 */
@Injectable({ providedIn: 'root' })
export class VoiceCreateService {
  /** Whether the voice-channel-creation dialog is currently open. */
  readonly isOpen = signal(false);


  /**
   * Opens the voice-channel-creation dialog.
   */
  open(): void {
    this.isOpen.set(true);
  }


  /**
   * Closes the voice-channel-creation dialog.
   */
  close(): void {
    this.isOpen.set(false);
  }
}
