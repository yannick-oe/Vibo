/**
 * @file Per-user volume menu opened from the ⋮ on a remote participant
 * row: participant name, volume slider (0–200 %, live % readout), the
 * local mute toggle and reset. Purely a local listening preference — it
 * writes localStorage via {@link VoiceVolumeService}, never Firestore;
 * the voice connection applies changes to the WebAudio graph with a ramp.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { VoiceVolumeService } from '../../../services/voice-volume.service';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import { DialogAnchor } from '../../../shared/dialog-shell/dialog-anchor';
import {
  USER_VOLUME_MAX_PERCENT,
  USER_VOLUME_STEP_PERCENT,
} from '../../../shared/voice.constants';

/**
 * Anchored menu (bottom sheet on mobile) adjusting how loud one remote
 * user plays back locally. The slider maps 0–200 % onto a 0–2 gain; the
 * local mute keeps the percentage underneath for the restore.
 */
@Component({
  selector: 'app-voice-volume-menu',
  imports: [DialogShellComponent],
  templateUrl: './voice-volume-menu.component.html',
  styleUrl: './voice-volume-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceVolumeMenuComponent {
  readonly uid = input.required<string>();

  readonly name = input.required<string>();

  readonly anchor = input<DialogAnchor | null>(null);

  readonly closed = output<void>();

  private readonly volumeService = inject(VoiceVolumeService);

  protected readonly maxPercent = USER_VOLUME_MAX_PERCENT;

  protected readonly stepPercent = USER_VOLUME_STEP_PERCENT;

  private readonly setting = computed(() => {
    this.volumeService.settings();
    return this.volumeService.settingFor(this.uid());
  });

  protected readonly volumePercent = computed(() => this.setting().percent);

  protected readonly isMutedLocally = computed(() => this.setting().muted);

  protected readonly volumeFillStyle = computed(
    () => `${(this.volumePercent() / USER_VOLUME_MAX_PERCENT) * 100}%`,
  );


  /**
   * Applies a slider change to the stored per-user volume.
   * @param event Input event of the volume range slider.
   */
  protected onVolumeInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.volumeService.setPercent(this.uid(), value);
  }


  /**
   * Toggles the local mute of this user (gain 0; the percentage survives
   * and is restored on unmute).
   */
  protected toggleMute(): void {
    this.volumeService.toggleMuted(this.uid());
  }


  /**
   * Resets this user to the default volume (100 %, not muted).
   */
  protected reset(): void {
    this.volumeService.reset(this.uid());
  }
}
