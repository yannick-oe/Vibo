/**
 * @file Soundboard popover of the voice bar: a dialog-shell card (anchored
 * popover on desktop, bottom sheet on mobile) with two labelled groups —
 * the synthesized presets under „Standard" and the workspace's custom
 * sounds under „Eigene" (one-shot loaded on open, §14: no listener). A
 * press plays locally and broadcasts to the channel via
 * {@link SoundboardService}; custom rows add a local-only preview and a
 * creator-only two-step delete. Guests see the German notice instead of
 * the add form. The popover stays open for repeated presses and closes on
 * Escape, outside click or the shell's sheet gestures.
 */
import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';

import { CustomSound } from '../../../models/soundboard.model';
import { AuthService } from '../../../services/auth.service';
import { CustomSoundService } from '../../../services/custom-sound.service';
import { SOUNDBOARD_SOUNDS, SoundboardSound } from '../../../services/soundboard-palette';
import { SoundboardService } from '../../../services/soundboard.service';
import { ToastService } from '../../../services/toast.service';
import { MAX_CUSTOM_SOUNDS } from '../../../shared/soundboard.constants';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import type { DialogAnchor } from '../../../shared/dialog-shell/dialog-shell.component';
import { CustomSoundFormComponent } from './custom-sound-form.component';

const GUEST_NOTE = 'Als Gast kannst du keine eigenen Sounds hinzufügen.';
const EMPTY_NOTE = 'Noch keine eigenen Sounds';
const CAP_NOTE = `Maximal ${MAX_CUSTOM_SOUNDS} eigene Sounds`;
const DELETE_ERROR_TOAST = 'Der Sound konnte nicht gelöscht werden.';

/**
 * Grouped soundboard rendered through the shared dialog shell: preset
 * grid, custom-sound rows with preview/delete and the guest-gated add
 * flow.
 */
@Component({
  selector: 'app-soundboard-popover',
  imports: [DialogShellComponent, CustomSoundFormComponent],
  templateUrl: './soundboard-popover.component.html',
  styleUrl: './soundboard-popover.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundboardPopoverComponent implements OnInit {
  private readonly soundboardService = inject(SoundboardService);

  private readonly customSoundService = inject(CustomSoundService);

  private readonly authService = inject(AuthService);

  private readonly toastService = inject(ToastService);

  readonly anchor = input<DialogAnchor | null>(null);

  readonly closed = output<void>();

  protected readonly sounds = SOUNDBOARD_SOUNDS;

  protected readonly customSounds = this.customSoundService.sounds;

  protected readonly isGuest = this.authService.isGuest;

  protected readonly guestNote = GUEST_NOTE;

  protected readonly emptyNote = EMPTY_NOTE;

  protected readonly capNote = CAP_NOTE;

  protected readonly formOpen = signal(false);

  protected readonly confirmingId = signal<string | null>(null);


  /**
   * Triggers the one-shot load of the custom sounds (session-cached; a
   * failed fetch retries on the next open).
   */
  ngOnInit(): void {
    void this.customSoundService.ensureLoaded();
  }


  /**
   * Plays and broadcasts a pressed preset; the popover stays open.
   * @param sound Soundboard sound of the pressed button.
   */
  protected press(sound: SoundboardSound): void {
    this.soundboardService.press(sound);
  }


  /**
   * Plays and broadcasts a pressed custom sound; the popover stays open.
   * @param sound Custom sound of the pressed button.
   */
  protected pressCustom(sound: CustomSound): void {
    this.soundboardService.pressCustom(sound);
  }


  /**
   * Plays a custom sound locally only (no broadcast) so it can be checked
   * before pressing it into the channel.
   * @param sound Custom sound to preview.
   */
  protected preview(sound: CustomSound): void {
    void this.customSoundService.play(sound);
  }


  /**
   * Reports whether the signed-in user may delete a custom sound
   * (creator-only, mirrored by the rules).
   * @param sound Custom sound of the row.
   */
  protected canDelete(sound: CustomSound): boolean {
    return sound.createdBy === this.authService.currentUser()?.uid;
  }


  /**
   * Reports whether the workspace-wide custom-sound cap is reached.
   */
  protected atCap(): boolean {
    return this.customSounds().length >= MAX_CUSTOM_SOUNDS;
  }


  /**
   * Switches a row into its two-step delete confirmation.
   * @param soundId Custom sound the delete was requested for.
   */
  protected requestDelete(soundId: string): void {
    this.confirmingId.set(soundId);
  }


  /**
   * Leaves the delete confirmation without deleting.
   */
  protected cancelDelete(): void {
    this.confirmingId.set(null);
  }


  /**
   * Deletes an own custom sound after the confirmation press; failures
   * show the German toast and keep the row.
   * @param sound Custom sound to delete.
   */
  protected async confirmDelete(sound: CustomSound): Promise<void> {
    this.confirmingId.set(null);
    try {
      await this.customSoundService.remove(sound.id);
    } catch {
      this.toastService.show(DELETE_ERROR_TOAST);
    }
  }


  /**
   * Closes the add form after a successful save (the list is refreshed by
   * the service already).
   */
  protected onSaved(): void {
    this.formOpen.set(false);
  }


  /**
   * Closes the popover.
   */
  protected close(): void {
    this.closed.emit();
  }
}
