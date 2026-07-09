/**
 * @file Shared state of the single notification toast near the top of the
 * screen: sender, context, an optional action line with an optional emoji and
 * a preview, plus the open action executed on click. Owns the auto-dismiss
 * timer and the notification sound; fed by the incoming-message notifier and
 * the activity feed, rendered by the toast component.
 */
import { Injectable, Signal, signal } from '@angular/core';

const AUTO_DISMISS_MS = 5000;
const NOTIFICATION_SOUND_PATH = 'sounds/chat-notification.mp3';

/** Emoji rendered inside a toast: character plus resolved Twemoji metadata. */
export interface NotificationToastEmoji {
  /** Unicode emoji character (also the plain-text fallback). */
  readonly char: string;
  /** Twemoji SVG asset path, or null for characters outside the catalog. */
  readonly asset: string | null;
  /** Accessible German name, or null for characters outside the catalog. */
  readonly name: string | null;
}

/** One rendered notification toast with its click action. */
export interface NotificationToastData {
  readonly senderName: string;
  readonly senderAvatar: string;
  readonly context: string;
  readonly action: string | null;
  readonly emoji: NotificationToastEmoji | null;
  readonly preview: string;
  readonly open: () => void;
}

/**
 * Owns the active notification toast: showing (with sound and auto-dismiss),
 * activating (open action + dismiss) and dismissing it.
 */
@Injectable({ providedIn: 'root' })
export class NotificationToastService {
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly sound = new Audio(NOTIFICATION_SOUND_PATH);

  private readonly toastState = signal<NotificationToastData | null>(null);

  /** The active notification toast, consumed by the toast component. */
  readonly toast: Signal<NotificationToastData | null> = this.toastState.asReadonly();


  /**
   * Shows a toast (replacing any active one), restarts the auto-dismiss
   * timer and plays the notification sound.
   * @param toast Fully built toast payload.
   */
  show(toast: NotificationToastData): void {
    this.toastState.set(toast);
    this.restartTimer();
    this.playSound();
  }


  /**
   * Runs the active toast's open action and dismisses it.
   */
  activate(): void {
    const toast = this.toastState();
    this.dismiss();
    toast?.open();
  }


  /**
   * Hides the active toast and clears its auto-dismiss timer.
   */
  dismiss(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = null;
    this.toastState.set(null);
  }


  /**
   * Restarts the auto-dismiss timer for the freshly shown toast.
   */
  private restartTimer(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => this.toastState.set(null), AUTO_DISMISS_MS);
  }


  /**
   * Plays the chat notification sound, restarting it if already playing;
   * browser autoplay rejections are swallowed.
   */
  private playSound(): void {
    this.sound.currentTime = 0;
    this.sound.play().catch(() => undefined);
  }
}
