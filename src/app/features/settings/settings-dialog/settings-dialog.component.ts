/**
 * @file Settings dialog opened from the topbar profile menu: a centered
 * card (bottom sheet on mobile) grouping app-wide preferences into semantic
 * sections — "Sounds" and, for accounts with an e-mail/password credential,
 * a "Konto" row opening the password-change dialog; future settings groups
 * slot in as further sections.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';

import { AccountSecurityService } from '../../../services/account-security.service';
import { AuthService } from '../../../services/auth.service';
import { SoundService } from '../../../services/sound.service';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import { PasswordChangeDialogComponent } from '../password-change-dialog/password-change-dialog.component';

const VOLUME_PERCENT_MAX = 100;

/**
 * App settings dialog. The sound preferences delegate straight to the
 * {@link SoundService} signals, so all persistence (localStorage keys)
 * and playback behavior stay unchanged by the move out of the menu. The
 * password row opens the password-change form in its own nested dialog
 * and is hidden for the shared guest account (client-side only, see
 * DEVIATIONS.md) and for Google-only accounts, which own no password
 * credential to re-authenticate with.
 */
@Component({
  selector: 'app-settings-dialog',
  imports: [DialogShellComponent, PasswordChangeDialogComponent],
  templateUrl: './settings-dialog.component.html',
  styleUrl: './settings-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsDialogComponent {
  readonly closed = output<void>();

  private readonly soundService = inject(SoundService);

  private readonly authService = inject(AuthService);

  private readonly accountSecurity = inject(AccountSecurityService);

  protected readonly canChangePassword = computed(() => {
    if (this.authService.currentUser() === null) return false;
    return !this.authService.isGuest() && this.accountSecurity.hasPasswordProvider();
  });

  protected readonly soundEnabled = this.soundService.soundEnabled;

  protected readonly swipeSoundEnabled = this.soundService.swipeSoundEnabled;

  protected readonly volumePercent = computed(() =>
    Math.round(this.soundService.soundVolume() * VOLUME_PERCENT_MAX),
  );

  protected readonly volumeFillStyle = computed(() => `${this.volumePercent()}%`);

  protected readonly isPasswordDialogOpen = signal(false);


  /**
   * Opens the password-change dialog from its settings row.
   */
  protected openPasswordDialog(): void {
    this.isPasswordDialogOpen.set(true);
  }


  /**
   * Closes the password-change dialog; the dialog shell returns focus to
   * the opening row.
   */
  protected closePasswordDialog(): void {
    this.isPasswordDialogOpen.set(false);
  }


  /**
   * Toggles all UI sound effects (master toggle).
   */
  protected toggleSoundEnabled(): void {
    this.soundService.setSoundEnabled(!this.soundEnabled());
  }


  /**
   * Toggles the opt-in sidebar toggle sound.
   */
  protected toggleSwipeSound(): void {
    this.soundService.setSwipeSoundEnabled(!this.swipeSoundEnabled());
  }


  /**
   * Applies a volume-slider change to the sound service.
   * @param event Input event of the volume range slider.
   */
  protected onVolumeInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.soundService.setSoundVolume(value / VOLUME_PERCENT_MAX);
  }


  /**
   * Plays the send sound at the current volume as a preview.
   */
  protected previewSound(): void {
    this.soundService.play('send');
  }
}
