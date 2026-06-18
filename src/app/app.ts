/**
 * @file Application root component hosting the router outlet and toast overlay.
 */
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ToastComponent } from './shared/toast/toast.component';
import { ThemeService } from './services/theme.service';

/**
 * Root shell rendering the active route and the global toast region. Injecting
 * the ThemeService here constructs it at bootstrap so the persisted theme stays
 * in sync with `<html data-theme>` on every screen.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent],
  template: '<router-outlet /><app-toast />',
})
export class App {
  private readonly themeService = inject(ThemeService);
}
