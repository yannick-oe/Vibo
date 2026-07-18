/**
 * @file Add form of the custom soundboard sounds inside the popover: a
 * native audio file input (validated client-side — size cap, real decode,
 * duration cap — with German inline errors in a reserved slot), a name
 * field with live counter and the save action writing the base64 document.
 * Guests never see this form; the popover renders the guest notice
 * instead.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn } from '@angular/forms';

import { CustomSoundService } from '../../../services/custom-sound.service';
import { SoundService } from '../../../services/sound.service';
import { ToastService } from '../../../services/toast.service';
import {
  ACCEPTED_SOUND_MIME_TYPES,
  MAX_CUSTOM_SOUNDS,
  SOUND_NAME_MAX,
} from '../../../shared/soundboard.constants';
import {
  AcceptedSoundFile,
  SOUND_FILE_REQUIREMENTS_HINT,
  checkSoundFile,
  durationLabel,
} from './sound-file-check';

const NAME_REQUIRED_ERROR = 'Bitte gib einen Namen für den Sound ein.';
const SAVE_ERROR_TOAST = 'Der Sound konnte nicht gespeichert werden.';
const CAP_REACHED_TOAST = `Maximal ${MAX_CUSTOM_SOUNDS} eigene Sounds`;

/**
 * Upload form of one custom soundboard sound. Emits saved after the
 * document is stored (the service refreshed the list already) and
 * cancelled when the user backs out.
 */
@Component({
  selector: 'app-custom-sound-form',
  imports: [ReactiveFormsModule],
  templateUrl: './custom-sound-form.component.html',
  styleUrl: './custom-sound-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomSoundFormComponent {
  private readonly customSoundService = inject(CustomSoundService);

  private readonly soundService = inject(SoundService);

  private readonly toastService = inject(ToastService);

  readonly saved = output<void>();

  readonly cancelled = output<void>();

  protected readonly fileHint = SOUND_FILE_REQUIREMENTS_HINT;

  protected readonly acceptTypes = ACCEPTED_SOUND_MIME_TYPES.join(',');

  protected readonly nameMax = SOUND_NAME_MAX;

  protected readonly fileError = signal('');

  protected readonly acceptedFile = signal<AcceptedSoundFile | null>(null);

  protected readonly fileName = signal('');

  protected readonly isChecking = signal(false);

  protected readonly isPending = signal(false);

  protected readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [requiredTrimmedValidator()],
  });

  protected readonly nameForm = new FormGroup({ name: this.nameControl });

  private readonly nameDraft = toSignal(this.nameControl.valueChanges, { initialValue: '' });

  protected readonly nameLength = computed(() => this.nameDraft().length);

  protected readonly fileInfo = computed(() => {
    const accepted = this.acceptedFile();
    return accepted ? `${this.fileName()} · ${durationLabel(accepted.durationMs)}` : '';
  });


  /**
   * Validates a newly chosen file (size, decode, duration) and keeps the
   * accepted payload or the German inline error; the input value is reset
   * so re-choosing the same file re-validates.
   * @param event Change event of the file input.
   */
  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) return;
    const file = input.files[0];
    input.value = '';
    this.isChecking.set(true);
    const result = await checkSoundFile(file, bytes => this.soundService.decodeSoundBytes(bytes));
    this.acceptedFile.set(result.ok ? result : null);
    this.fileError.set(result.ok ? '' : result.error);
    this.fileName.set(result.ok ? file.name : '');
    this.isChecking.set(false);
  }


  /**
   * Resolves the inline error message of the name field; empty while the
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
   * Reports whether the form can be submitted.
   */
  protected canSave(): boolean {
    return this.acceptedFile() !== null && this.nameControl.valid && !this.isPending();
  }


  /**
   * Stores the validated sound; on success the popover list is already
   * refreshed and the form closes, failures keep the form open with a
   * German toast (count cap or write error).
   */
  protected async save(): Promise<void> {
    const accepted = this.acceptedFile();
    if (!accepted || !this.canSave()) return;
    this.isPending.set(true);
    const { mimeType, durationMs, data } = accepted;
    const upload = { name: this.nameControl.value.trim(), mimeType, durationMs, data };
    try {
      const stored = await this.customSoundService.create(upload);
      if (stored) this.saved.emit();
      else this.toastService.show(CAP_REACHED_TOAST);
    } catch {
      this.toastService.show(SAVE_ERROR_TOAST);
    } finally {
      this.isPending.set(false);
    }
  }


  /**
   * Closes the form without saving.
   */
  protected cancel(): void {
    this.cancelled.emit();
  }
}


/**
 * Validates that the sound name is non-empty after trimming.
 */
function requiredTrimmedValidator(): ValidatorFn {
  return control => (String(control.value ?? '').trim() ? null : { required: true });
}
