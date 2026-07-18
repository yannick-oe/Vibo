/**
 * @file Soundboard popover of the voice bar: a small dialog-shell card
 * (anchored popover on desktop, bottom sheet on mobile) with one labelled
 * button per soundboard sound. A press plays locally and broadcasts to the
 * channel via {@link SoundboardService}; the popover stays open for
 * repeated presses and closes on Escape, outside click or the shell's
 * sheet gestures.
 */
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { SOUNDBOARD_SOUNDS, SoundboardSound } from '../../../services/soundboard-palette';
import { SoundboardService } from '../../../services/soundboard.service';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import type { DialogAnchor } from '../../../shared/dialog-shell/dialog-shell.component';

/**
 * Grid of soundboard buttons rendered through the shared dialog shell.
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

  protected readonly sounds = SOUNDBOARD_SOUNDS;


  /**
   * Plays and broadcasts a pressed sound; the popover stays open.
   * @param sound Soundboard sound of the pressed button.
   */
  protected press(sound: SoundboardSound): void {
    this.soundboardService.press(sound);
  }


  /**
   * Closes the popover.
   */
  protected close(): void {
    this.closed.emit();
  }
}
