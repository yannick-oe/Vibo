/**
 * @file Small modal dialog creating a voice channel: one name field with a
 * live character counter, rendered through the shared dialog shell (scrim,
 * focus trap, Escape, mobile bottom sheet). Gating mirrors text-channel
 * creation exactly — every signed-in user, including the shared guest
 * account, may create voice channels.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn } from '@angular/forms';

import { ToastService } from '../../../services/toast.service';
import { VoiceChannelService } from '../../../services/voice-channel.service';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import { VOICE_NAME_MAX } from '../../../shared/voice.constants';

const NAME_REQUIRED_ERROR = 'Bitte gib einen Namen für den Sprachkanal ein.';
const CREATE_ERROR = 'Der Sprachkanal konnte nicht erstellt werden.';

/**
 * Modal flow creating a voice channel. On create the channel is persisted
 * and the dialog closes; the new channel appears in the sidebar's
 * "Sprachkanäle" section via the refreshed channel list. Nobody is joined
 * automatically — joining stays an explicit click on the channel row.
 */
@Component({
  selector: 'app-voice-create-dialog',
  imports: [ReactiveFormsModule, DialogShellComponent],
  templateUrl: './voice-create-dialog.component.html',
  styleUrl: './voice-create-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceCreateDialogComponent implements AfterViewInit {
  private readonly voiceChannelService = inject(VoiceChannelService);

  private readonly toastService = inject(ToastService);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  readonly closed = output<void>();

  protected readonly nameMax = VOICE_NAME_MAX;

  protected readonly isPending = signal(false);

  protected readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [requiredTrimmedValidator()],
  });

  protected readonly nameForm = new FormGroup({ name: this.nameControl });

  private readonly nameDraft = toSignal(this.nameControl.valueChanges, { initialValue: '' });

  protected readonly nameLength = computed(() => this.nameDraft().length);


  /**
   * Focuses the name input once the dialog is rendered (after the shell's
   * default first-focusable focus).
   */
  ngAfterViewInit(): void {
    this.nameInput()?.nativeElement.focus();
  }


  /**
   * Closes the dialog without creating a voice channel.
   */
  protected close(): void {
    this.closed.emit();
  }


  /**
   * Resolves the inline error message for the name field; empty while the
   * field is untouched or valid.
   */
  protected nameError(): string {
    if (this.nameControl.pristine) return '';
    return this.nameControl.hasError('required') ? NAME_REQUIRED_ERROR : '';
  }


  /**
   * Reports whether the name field currently shows an error.
   */
  protected nameInvalid(): boolean {
    return this.nameError() !== '';
  }


  /**
   * Creates the voice channel and closes the dialog; on failure a toast is
   * shown and the dialog stays open for another attempt.
   */
  protected async create(): Promise<void> {
    if (this.nameControl.invalid || this.isPending()) return;
    this.isPending.set(true);
    try {
      await this.voiceChannelService.createVoiceChannel(this.nameControl.value);
      this.closed.emit();
    } catch {
      this.toastService.show(CREATE_ERROR);
      this.isPending.set(false);
    }
  }
}


/**
 * Validates that the voice-channel name is non-empty after trimming.
 */
function requiredTrimmedValidator(): ValidatorFn {
  return control => (String(control.value ?? '').trim() ? null : { required: true });
}
