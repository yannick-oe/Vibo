/**
 * @file TEMPORARY DIAGNOSTIC — remove after verification-flow signoff.
 * Fixed on-screen panel rendering the auth diagnostics feed collected by
 * {@link AuthDiagnosticsService}: token emissions with the decoded claim,
 * verify-screen steps, guard decisions and gated-stream lifecycles.
 * Mounted on the verify screen and in the app shell; renders nothing —
 * zero DOM, zero cost — unless the localStorage flag `vibo:auth-debug` is
 * '1' and the panel was not dismissed. See DEVIATIONS.md (2026-07-20).
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AuthDiagnosticsService } from '../../services/auth-diagnostics.service';

/**
 * TEMPORARY DIAGNOSTIC — remove after verification-flow signoff.
 * Presentational shell around the diagnostics entries signal with a
 * dismiss button; all state lives in the service.
 */
@Component({
  selector: 'app-auth-debug-panel',
  templateUrl: './auth-debug-panel.component.html',
  styleUrl: './auth-debug-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthDebugPanelComponent {
  protected readonly diagnostics = inject(AuthDiagnosticsService);
}
