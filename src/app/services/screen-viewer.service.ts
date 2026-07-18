/**
 * @file Shared open-state for the screen-share viewer dialog: which
 * sharing session is being watched. Opened from the roster screen glyphs
 * (sidebar section and voice bar); rendered by the app shell at the top
 * level like the other overlay dialogs.
 */
import { Injectable, signal } from '@angular/core';

/**
 * Holds the session id whose screen share the viewer dialog shows, or
 * null while the viewer is closed.
 */
@Injectable({ providedIn: 'root' })
export class ScreenViewerService {
  /** Session id currently being watched, or null. */
  readonly viewedSession = signal<string | null>(null);


  /**
   * Opens the viewer for a sharing session.
   * @param sessionId Session whose stream should be shown.
   */
  open(sessionId: string): void {
    this.viewedSession.set(sessionId);
  }


  /**
   * Closes the viewer.
   */
  close(): void {
    this.viewedSession.set(null);
  }
}
