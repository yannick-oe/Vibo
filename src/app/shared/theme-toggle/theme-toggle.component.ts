/**
 * @file Dedicated sun/moon icon button that toggles the app between light and
 * dark mode. The accessible label and aria-pressed reflect the resulting state.
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ThemeService } from '../../services/theme.service';

const ENABLE_DARK_LABEL = 'Dark Mode aktivieren';
const ENABLE_LIGHT_LABEL = 'Light Mode aktivieren';

/**
 * Round icon button placed next to the account avatar. Shows a moon in light
 * mode and a sun in dark mode; the icon inherits its color from a design token
 * via `currentColor`, so it stays legible in both themes.
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

  protected readonly label = computed(() =>
    this.isDark() ? ENABLE_LIGHT_LABEL : ENABLE_DARK_LABEL,
  );


  /**
   * Switches between light and dark mode.
   */
  protected toggle(): void {
    this.themeService.toggle();
  }
}
