/**
 * @file Service controlling the global toast overlay message.
 */
import { Injectable, signal } from '@angular/core';

const TOAST_DURATION_MS = 3000;

/** Content of the currently visible toast. */
export interface ToastData {
  readonly message: string;
  readonly icon?: string;
}

/**
 * Shows one overlay message at a time and dismisses it automatically.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly current = signal<ToastData | null>(null);

  readonly toast = this.current.asReadonly();

  private dismissTimer: ReturnType<typeof setTimeout> | null = null;


  /**
   * Shows a toast and schedules its automatic dismissal.
   * @param message Text to display.
   * @param icon Optional public asset path of a leading icon.
   */
  show(message: string, icon?: string): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.current.set({ message, icon });
    this.dismissTimer = setTimeout(() => this.current.set(null), TOAST_DURATION_MS);
  }
}
