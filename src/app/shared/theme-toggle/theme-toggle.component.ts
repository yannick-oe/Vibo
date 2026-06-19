/**
 * @file Theme toggle icon-button that flips the app between light and dark via
 * the shared ThemeService. Has no auth dependency, so it works pre-login on the
 * auth screen as well as inside the app.
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ThemeService } from '../../services/theme.service';

const TOGGLE_LABEL = 'Theme umschalten';

/**
 * Switch-role icon-button showing a moon in dark and a sun in light theme.
 * The icon reflects the active theme; toggling drives the ThemeService, whose
 * signal keeps `aria-checked` in sync.
 */
@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeToggleComponent {
  private readonly themeService = inject(ThemeService);

  protected readonly isDark = this.themeService.isDark;

  protected readonly toggleLabel = TOGGLE_LABEL;


  /**
   * Flips the active color theme between light and dark.
   */
  protected toggle(): void {
    this.themeService.toggle();
  }
}
