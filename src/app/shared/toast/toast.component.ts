/**
 * @file Global toast overlay rendering the ToastService message.
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService } from '../../services/toast.service';

/**
 * Persistent live region in the bottom-right corner that slides in the
 * current toast message and hides it when the service clears it.
 */
@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent {
  protected readonly toast = inject(ToastService).toast;
}
