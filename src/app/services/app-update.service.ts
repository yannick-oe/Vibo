/**
 * @file Listens for ready service-worker versions and offers a manual reload
 * via the global toast — the app never force-reloads on its own.
 */
import { Injectable, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

import { ToastService } from './toast.service';

const UPDATE_MESSAGE = 'Neue Version verfügbar';

const UPDATE_ACTION_LABEL = 'Neu laden';

/**
 * Bridges SwUpdate version events to the toast UI. Root-scoped; the single
 * subscription intentionally lives for the whole app lifetime.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);

  private readonly toastService = inject(ToastService);


  /**
   * Starts watching for downloaded updates; no-op when the service worker is
   * disabled (dev mode, unsupported browser).
   */
  init(): void {
    if (!this.swUpdate.isEnabled) return;
    this.swUpdate.versionUpdates
      .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
      .subscribe(() => this.offerReload());
  }


  /**
   * Shows the persistent update toast; activating it reloads the document so
   * the new service-worker version takes over.
   */
  private offerReload(): void {
    this.toastService.showWithAction(UPDATE_MESSAGE, {
      label: UPDATE_ACTION_LABEL,
      run: () => document.location.reload(),
    });
  }
}
