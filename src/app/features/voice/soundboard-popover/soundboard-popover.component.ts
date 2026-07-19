/**
 * @file Soundboard popover of the voice bar: a dialog-shell card (anchored
 * popover on desktop, bottom sheet on mobile) with one grid of the curated
 * presets. A press plays locally and broadcasts to the channel via
 * {@link SoundboardService}; nothing is fetched on open — each preset's
 * file loads lazily on its first play. The popover stays open for repeated
 * presses and closes on Escape, outside click or the shell's sheet
 * gestures.
 */
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { SoundboardService } from '../../../services/soundboard.service';
import { SOUNDBOARD_PRESETS, SoundboardPreset } from '../../../shared/soundboard.constants';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import type { DialogAnchor } from '../../../shared/dialog-shell/dialog-shell.component';

/**
 * Preset grid rendered through the shared dialog shell; every press plays
 * and broadcasts, the popover stays open.
 */
@Component({
  selector: 'app-soundboard-popover',
  imports: [DialogShellComponent],
  templateUrl: './soundboard-popover.component.html',
  styleUrl: './soundboard-popover.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundboardPopoverComponent {
  private readonly soundboardService = inject(SoundboardService);

  readonly anchor = input<DialogAnchor | null>(null);

  readonly closed = output<void>();

  protected readonly presets = SOUNDBOARD_PRESETS;


  /**
   * Plays and broadcasts a pressed preset; the popover stays open.
   * @param preset Soundboard preset of the pressed button.
   */
  protected press(preset: SoundboardPreset): void {
    this.soundboardService.press(preset);
  }


  /**
   * Closes the popover.
   */
  protected close(): void {
    this.closed.emit();
  }
}
