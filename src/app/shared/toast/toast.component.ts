/**
 * @file Global toast overlay rendering the ToastService message.
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastAction, ToastService } from '../../services/toast.service';

/**
 * Persistent live region in the bottom-right corner that slides in the
 * current toast message, renders an optional action button and hides the
 * toast when the service clears it.
 */
@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent {
  private readonly toastService = inject(ToastService);

  protected readonly toast = this.toastService.toast;


  /**
   * Runs a toast action and dismisses the toast afterwards.
   * @param action Action attached to the visible toast.
   */
  protected runAction(action: ToastAction): void {
    action.run();
    this.toastService.dismiss();
  }
}
