/**
 * @file Incoming-message notification toast: a persistent top live region that
 * slides in the current notification (sender, context and preview), navigates
 * to the conversation when clicked and can be dismissed. The service owns the
 * state, auto-dismiss timer and navigation; this component only renders it.
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { NotificationService } from '../../services/notification.service';
import { AvatarFallbackDirective } from '../avatar/avatar-fallback.directive';

/**
 * Renders the active incoming-message toast near the top of the screen. The
 * region is a persistent polite live region so a new message is announced; the
 * card appears inside it and reserves no layout space (fixed overlay, CLS 0).
 */
@Component({
  selector: 'app-notification-toast',
  imports: [AvatarFallbackDirective],
  templateUrl: './notification-toast.component.html',
  styleUrl: './notification-toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationToastComponent {
  private readonly notifications = inject(NotificationService);

  protected readonly toast = this.notifications.toast;


  /**
   * Opens the notified conversation and dismisses the toast.
   * @param route Router commands of the target conversation.
   */
  protected open(route: string[]): void {
    this.notifications.open(route);
  }


  /**
   * Dismisses the active toast without navigating.
   */
  protected dismiss(): void {
    this.notifications.dismiss();
  }
}
