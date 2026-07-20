/**
 * @file "Passwort ändern" form inside the settings dialog: current
 * password, new password and confirmation with live validation, the
 * re-authentication + update flow and specific German error messages in
 * reserved slots. Hidden entirely for the guest account and for accounts
 * without an e-mail/password credential (see the settings dialog).
 */
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FirebaseError } from 'firebase/app';

import { AccountSecurityService } from '../../../services/account-security.service';
import { PasswordInputComponent } from '../../../shared/password-input/password-input.component';
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  WEAK_PASSWORD_CODES,
  WRONG_PASSWORD_CODES,
  matchingPasswordsValidator,
} from '../../../shared/validators/password.validators';

const SUCCESS_MESSAGE = 'Dein Passwort wurde geändert.';
const WRONG_CURRENT_MESSAGE = 'Das aktuelle Passwort ist falsch.';
const RECENT_LOGIN_MESSAGE =
  'Aus Sicherheitsgründen ist eine erneute Anmeldung nötig. Bitte melde dich ab und wieder an.';
const TOO_MANY_REQUESTS_MESSAGE = 'Zu viele Versuche. Bitte warte einen Moment.';
const GENERAL_ERROR_MESSAGE = 'Das hat leider nicht geklappt. Bitte versuche es später erneut.';

const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  current: {
    required: 'Bitte gib dein aktuelles Passwort ein',
  },
  next: {
    required: 'Bitte gib ein neues Passwort ein',
    minlength: PASSWORD_TOO_SHORT_MESSAGE,
    passwordPolicy: PASSWORD_TOO_SHORT_MESSAGE,
  },
  confirm: {
    required: 'Bitte bestätige dein neues Passwort',
  },
};

/**
 * Password-change form: re-authenticates with the current password, then
 * updates to the validated new one. Submit stays disabled while the form
 * is invalid or a request is in flight; success clears the fields.
 */
@Component({
  selector: 'app-password-change',
  imports: [ReactiveFormsModule, PasswordInputComponent],
  templateUrl: './password-change.component.html',
  styleUrl: './password-change.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordChangeComponent {
  private readonly accountSecurity = inject(AccountSecurityService);

  private readonly formBuilder = inject(NonNullableFormBuilder);

  protected readonly isPending = signal(false);

  protected readonly generalError = signal('');

  protected readonly successMessage = signal('');

  protected readonly form = this.formBuilder.group(
    {
      current: ['', Validators.required],
      next: [
        '',
        [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)],
        [this.accountSecurity.passwordPolicyValidator()],
      ],
      confirm: ['', Validators.required],
    },
    { validators: matchingPasswordsValidator('next', 'confirm') },
  );


  /**
   * Resolves the visible error message for a control; the confirmation
   * additionally reports the group-level mismatch.
   * @param controlName Form control key.
   */
  protected errorMessage(controlName: string): string {
    const control = this.form.get(controlName);
    if (!control || !control.touched) return '';
    const firebaseMessage = control.errors?.['firebase'] as string | undefined;
    if (firebaseMessage) return firebaseMessage;
    const key = Object.keys(control.errors ?? {})[0];
    if (key) return ERROR_MESSAGES[controlName]?.[key] ?? '';
    return this.mismatchMessage(controlName);
  }


  /**
   * Reports the group-level mismatch under the confirmation field once
   * both password fields are filled.
   * @param controlName Form control key being rendered.
   */
  private mismatchMessage(controlName: string): string {
    const mismatch = controlName === 'confirm' && this.form.errors?.['passwordMismatch'];
    return mismatch ? PASSWORD_MISMATCH_MESSAGE : '';
  }


  /**
   * Reports whether a control should be marked invalid for assistive tech.
   * @param controlName Form control key.
   */
  protected isInvalid(controlName: string): boolean {
    return this.errorMessage(controlName) !== '';
  }


  /**
   * Runs the re-authentication + password update and maps failures to
   * specific fields or the general slot; success clears the form.
   */
  protected async submit(): Promise<void> {
    if (this.form.invalid || this.isPending()) return;
    const { current, next } = this.form.getRawValue();
    this.isPending.set(true);
    this.generalError.set('');
    this.successMessage.set('');
    try {
      await this.accountSecurity.changePassword(current, next);
      this.finishSuccessfully();
    } catch (error: unknown) {
      this.handleChangeError(error);
    } finally {
      this.isPending.set(false);
    }
  }


  /**
   * Shows the success confirmation and clears all three fields.
   */
  private finishSuccessfully(): void {
    this.successMessage.set(SUCCESS_MESSAGE);
    this.form.reset();
  }


  /**
   * Maps Firebase errors to the matching field or the general slot.
   * @param error Unknown error thrown by the change flow.
   */
  private handleChangeError(error: unknown): void {
    const code = error instanceof FirebaseError ? error.code : '';
    if (WRONG_PASSWORD_CODES.includes(code)) return this.setFieldError('current', WRONG_CURRENT_MESSAGE);
    if (WEAK_PASSWORD_CODES.includes(code)) return this.setFieldError('next', PASSWORD_TOO_SHORT_MESSAGE);
    if (code === 'auth/requires-recent-login') return this.generalError.set(RECENT_LOGIN_MESSAGE);
    if (code === 'auth/too-many-requests') return this.generalError.set(TOO_MANY_REQUESTS_MESSAGE);
    this.generalError.set(GENERAL_ERROR_MESSAGE);
  }


  /**
   * Attaches a message to a form control; it clears on the next edit.
   * @param controlName Affected form control key.
   * @param message German error message for the field.
   */
  private setFieldError(controlName: string, message: string): void {
    const control = this.form.get(controlName);
    control?.setErrors({ firebase: message });
    control?.markAsTouched();
  }
}
