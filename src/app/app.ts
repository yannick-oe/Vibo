/**
 * @file Application root component hosting the router outlet, toast region and
 * the celebratory reaction-effects and laugh-burst overlays.
 */
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { EffectsOverlayComponent } from './shared/effects-overlay/effects-overlay.component';
import { LaughBurstOverlayComponent } from './shared/laugh-burst-overlay/laugh-burst-overlay.component';
import { ToastComponent } from './shared/toast/toast.component';
import { ThemeService } from './services/theme.service';

/**
 * Root shell rendering the active route, the global toast region and the
 * full-screen reaction-effects and broadcast laugh-burst overlays. Injecting
 * the ThemeService here constructs it at bootstrap so the persisted theme
 * stays in sync with `<html data-theme>` on every screen.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent, EffectsOverlayComponent, LaughBurstOverlayComponent],
  template: '<router-outlet /><app-toast /><app-effects-overlay /><app-laugh-burst-overlay />',
})
export class App {
  private readonly themeService = inject(ThemeService);
}
