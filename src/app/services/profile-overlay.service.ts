/**
 * @file Shared open state for the app-shell-hosted profile dialog so any
 * surface (command palette, friend rows) can open a user's profile without
 * owning the dialog component.
 */
import { Injectable, signal } from '@angular/core';

/**
 * Holds the uid whose profile dialog the app shell should render, or null
 * when closed. Lets surfaces outside the shell (command palette, friends
 * view rows) open a profile dialog without rendering it themselves.
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
