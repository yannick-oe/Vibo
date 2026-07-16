/**
 * @file Single-owner pin for message-row hover action bars: a row that owns
 * an open overlay (⋮ menu, reaction picker, edit picker) keeps its bar
 * visible while the overlay's scrim removes the row from the CSS hover
 * chain. At most one row is pinned app-wide.
 */
import { Injectable, signal } from '@angular/core';

/**
 * Holds which message row currently pins its action bar. Pinning replaces
 * any previous owner (so two rows can never pin simultaneously); releasing
 * is owner-checked so a stale release can never drop a newer pin.
 */
@Injectable({ providedIn: 'root' })
export class MessagePinService {
  private readonly state = signal<object | null>(null);

  /** Row instance currently pinning its action bar, or null. */
  readonly owner = this.state.asReadonly();


  /**
   * Pins the given row, replacing any previously pinned one.
   * @param owner Row instance that opened an owned overlay.
   */
  pin(owner: object): void {
    this.state.set(owner);
  }


  /**
   * Releases the pin if — and only if — the given row still holds it.
   * @param owner Row instance whose overlay closed or unmounted.
   */
  release(owner: object): void {
    if (this.state() === owner) this.state.set(null);
  }
}
