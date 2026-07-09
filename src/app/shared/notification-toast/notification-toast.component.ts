/**
 * @file Notification toast: a persistent top live region that slides in the
 * current notification (sender, context, optional action line with emoji and
 * a preview), runs its open action when clicked and can be dismissed. The
 * toast service owns the state, auto-dismiss timer and sound; this component
 * only renders it.
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { NotificationToastService } from '../../services/notification-toast.service';
import { AvatarFallbackDirective } from '../avatar/avatar-fallback.directive';

/**
 * Renders the active notification toast near the top of the screen. The
 * region is a persistent polite live region so a new notification is
 * announced; the card appears inside it and reserves no layout space (fixed
 * overlay, CLS 0).
 */
@Component({
  selector: 'app-notification-toast',
  imports: [AvatarFallbackDirective],
  templateUrl: './notification-toast.component.html',
  styleUrl: './notification-toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationToastComponent {
  private readonly toastService = inject(NotificationToastService);

  protected readonly toast = this.toastService.toast;


  /**
   * Runs the active toast's open action (navigation) and dismisses it.
   */
  protected activate(): void {
    this.toastService.activate();
  }


  /**
   * Dismisses the active toast without navigating.
   */
  protected dismiss(): void {
    this.toastService.dismiss();
  }
}
