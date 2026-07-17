/**
 * @file Service controlling the global toast overlay message.
 */
import { Injectable, signal } from '@angular/core';

const TOAST_DURATION_MS = 3000;

/** Action button rendered inside a persistent toast. */
export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

/** Content of the currently visible toast. */
export interface ToastData {
  readonly message: string;
  readonly icon?: string;
  readonly action?: ToastAction;
}

/**
 * Shows one overlay message at a time. Plain toasts dismiss automatically;
 * toasts carrying an action stay until the action runs or a newer toast
 * replaces them, so the user cannot miss the offered choice.
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
    this.clearTimer();
    this.current.set({ message, icon });
    this.dismissTimer = setTimeout(() => this.current.set(null), TOAST_DURATION_MS);
  }


  /**
   * Shows a persistent toast with an action button and no auto-dismissal.
   * @param message Text to display.
   * @param action Labelled action offered next to the message.
   */
  showWithAction(message: string, action: ToastAction): void {
    this.clearTimer();
    this.current.set({ message, action });
  }


  /** Hides the current toast immediately. */
  dismiss(): void {
    this.clearTimer();
    this.current.set(null);
  }


  /** Cancels a pending auto-dismiss so it cannot hide a newer toast. */
  private clearTimer(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = null;
  }
}
