/**
 * @file Confirm dialog deleting a voice channel (creator-only, opened from
 * the channel row's management menu). Deleting is enabled only while the
 * client sees zero non-stale participants; the roster is live, so a join
 * while the dialog is open disables the button again. The race of a join
 * landing in the same instant as the delete is tolerated — residual
 * participant documents age out via the stale filter (documented).
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { VoiceChannel } from '../../../models/voice.model';
import { ToastService } from '../../../services/toast.service';
import { VoiceChannelService } from '../../../services/voice-channel.service';
import { VoiceRosterService } from '../../../services/voice-roster.service';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';

const DELETE_ERROR = 'Der Sprachkanal konnte nicht gelöscht werden.';

/**
 * Modal confirmation for deleting an empty voice channel.
 */
@Component({
  selector: 'app-voice-delete-dialog',
  imports: [DialogShellComponent],
  templateUrl: './voice-delete-dialog.component.html',
  styleUrl: './voice-delete-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceDeleteDialogComponent {
  private readonly voiceChannelService = inject(VoiceChannelService);

  private readonly rosterService = inject(VoiceRosterService);

  private readonly toastService = inject(ToastService);

  readonly channel = input.required<VoiceChannel>();

  readonly closed = output<void>();

  protected readonly isPending = signal(false);

  protected readonly isOccupied = computed(
    () => this.rosterService.participantsOf(this.channel().id).length > 0,
  );


  /**
   * Closes the dialog without deleting.
   */
  protected close(): void {
    this.closed.emit();
  }


  /**
   * Deletes the channel and closes; on failure a toast is shown and the
   * dialog stays open.
   */
  protected async confirmDelete(): Promise<void> {
    if (this.isOccupied() || this.isPending()) return;
    this.isPending.set(true);
    try {
      await this.voiceChannelService.remove(this.channel().id);
      this.closed.emit();
    } catch {
      this.toastService.show(DELETE_ERROR);
      this.isPending.set(false);
    }
  }
}
