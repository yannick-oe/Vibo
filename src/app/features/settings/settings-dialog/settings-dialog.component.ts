/**
 * @file Settings dialog opened from the topbar profile menu: a centered
 * card (bottom sheet on mobile) grouping app-wide preferences into semantic
 * sections. Currently holds the "Sounds" section moved out of the profile
 * menu; future settings groups slot in as further sections.
 */
import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';

import { SoundService } from '../../../services/sound.service';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';

const VOLUME_PERCENT_MAX = 100;

/**
 * App settings dialog. The sound preferences delegate straight to the
 * {@link SoundService} signals, so all persistence (localStorage keys)
 * and playback behavior stay unchanged by the move out of the menu.
 */
@Component({
  selector: 'app-settings-dialog',
  imports: [DialogShellComponent],
  templateUrl: './settings-dialog.component.html',
  styleUrl: './settings-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsDialogComponent {
  readonly closed = output<void>();

  private readonly soundService = inject(SoundService);

  protected readonly soundEnabled = this.soundService.soundEnabled;

  protected readonly swipeSoundEnabled = this.soundService.swipeSoundEnabled;

  protected readonly volumePercent = computed(() =>
    Math.round(this.soundService.soundVolume() * VOLUME_PERCENT_MAX),
  );

  protected readonly volumeFillStyle = computed(() => `${this.volumePercent()}%`);


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
