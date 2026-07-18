/**
 * @file Small modal dialog renaming a voice channel (creator-only, opened
 * from the channel row's management menu): the same name field, live
 * character counter and trim validation as the creation dialog, prefilled
 * with the current name. Rendered through the shared dialog shell.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn } from '@angular/forms';

import { VoiceChannel } from '../../../models/voice.model';
import { ToastService } from '../../../services/toast.service';
import { VoiceChannelService } from '../../../services/voice-channel.service';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import { VOICE_NAME_MAX } from '../../../shared/voice.constants';

const NAME_REQUIRED_ERROR = 'Bitte gib einen Namen für den Sprachkanal ein.';
const RENAME_ERROR = 'Der Sprachkanal konnte nicht umbenannt werden.';

/**
 * Modal flow renaming a voice channel. Saving persists the trimmed name
 * and closes; other clients see the change with their next list refresh
 * (documented one-shot-list trade-off).
 */
@Component({
  selector: 'app-voice-rename-dialog',
  imports: [ReactiveFormsModule, DialogShellComponent],
  templateUrl: './voice-rename-dialog.component.html',
  styleUrl: './voice-rename-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRenameDialogComponent implements AfterViewInit {
  private readonly voiceChannelService = inject(VoiceChannelService);

  private readonly toastService = inject(ToastService);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  readonly channel = input.required<VoiceChannel>();

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
   * Prefills the current name and focuses the input once the dialog is
   * rendered (after the shell's default first-focusable focus).
   */
  ngAfterViewInit(): void {
    this.nameControl.setValue(this.channel().name);
    this.nameInput()?.nativeElement.focus();
  }


  /**
   * Closes the dialog without renaming.
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
   * Saves the new name and closes; on failure a toast is shown and the
   * dialog stays open for another attempt.
   */
  protected async save(): Promise<void> {
    if (this.nameControl.invalid || this.isPending()) return;
    this.isPending.set(true);
    try {
      await this.voiceChannelService.rename(this.channel().id, this.nameControl.value);
      this.closed.emit();
    } catch {
      this.toastService.show(RENAME_ERROR);
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
