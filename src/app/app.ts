/**
 * @file Application root component hosting the router outlet, toast region and
 * the celebratory reaction-effects overlay.
 */
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { EffectsOverlayComponent } from './shared/effects-overlay/effects-overlay.component';
import { ToastComponent } from './shared/toast/toast.component';
import { ThemeService } from './services/theme.service';

/**
 * Root shell rendering the active route, the global toast region and the
 * full-screen reaction-effects overlay. Injecting the ThemeService here
 * constructs it at bootstrap so the persisted theme stays in sync with
 * `<html data-theme>` on every screen.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent, EffectsOverlayComponent],
  template: '<router-outlet /><app-toast /><app-effects-overlay />',
})
export class App {
  private readonly themeService = inject(ThemeService);
}
