/**
 * @file Shared open state for the own-profile dialog so it can be opened
 * from outside the topbar (e.g. the command palette).
 */
import { Injectable, signal } from '@angular/core';

/**
 * Holds the uid whose profile dialog the app shell should render, or null
 * when closed. Lets the command palette open the signed-in user's profile
 * without owning the dialog component itself.
 */
@Injectable({ providedIn: 'root' })
export class ProfileOverlayService {
  private readonly uidState = signal<string | null>(null);

  readonly uid = this.uidState.asReadonly();


  /**
   * Opens the profile dialog for the given uid.
   * @param uid Uid whose profile to show.
   */
  open(uid: string): void {
    this.uidState.set(uid);
  }


  /**
   * Closes the profile dialog.
   */
  close(): void {
    this.uidState.set(null);
  }
}
