/**
 * @file Reset-password screen: sets a new password for a valid reset link.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FirebaseError } from 'firebase/app';

import { AccountSecurityService } from '../../../services/account-security.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { PasswordInputComponent } from '../../../shared/password-input/password-input.component';
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  WEAK_PASSWORD_CODES,
  matchingPasswordsValidator,
} from '../../../shared/validators/password.validators';

const RESET_MODE = 'resetPassword';
const TOAST_MESSAGE = 'Anmelden';
const GENERAL_ERROR_MESSAGE = 'Das hat leider nicht geklappt. Bitte versuche es später erneut.';
const DEFAULT_INVALID_MESSAGE = 'Dieser Link ist abgelaufen oder ungültig.';
const CODE_ERROR_MESSAGES: Record<string, string> = {
  'auth/expired-action-code': 'Dieser Link ist abgelaufen. Bitte fordere einen neuen an.',
  'auth/invalid-action-code':
    'Dieser Link ist ungültig oder wurde bereits verwendet. Bitte fordere einen neuen an.',
};

const PASSWORD_ERROR_MESSAGES: Record<string, string> = {
  required: 'Bitte gib ein Passwort ein',
  minlength: PASSWORD_TOO_SHORT_MESSAGE,
  passwordPolicy: PASSWORD_TOO_SHORT_MESSAGE,
};

/** Validity state of the reset code from the e-mail link. */
type CodeState = 'checking' | 'valid' | 'invalid';

/**
 * Verifies the Firebase reset code and lets the user set a new password.
 * Without a valid code the form is replaced by a re-request hint.
 */
@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, PasswordInputComponent],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent implements OnInit, AfterViewInit {
  private readonly authService = inject(AuthService);

  private readonly accountSecurity = inject(AccountSecurityService);

  private readonly formBuilder = inject(NonNullableFormBuilder);

  private readonly router = inject(Router);

  private readonly toast = inject(ToastService);

  private readonly title = viewChild<ElementRef<HTMLHeadingElement>>('title');

  readonly oobCode = input<string>();

  readonly mode = input<string>();

  readonly continueUrl = input<string>();

  protected readonly codeState = signal<CodeState>('checking');

  protected readonly codeError = signal(DEFAULT_INVALID_MESSAGE);

  protected readonly isPending = signal(false);

  protected readonly generalError = signal('');

  protected readonly form = this.formBuilder.group(
    {
      password: [
        '',
        [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)],
        [this.accountSecurity.passwordPolicyValidator()],
      ],
      confirm: ['', Validators.required],
    },
    { validators: matchingPasswordsValidator('password', 'confirm') },
  );


  /**
   * Verifies the reset code from the e-mail link query parameters; rejects
   * links without a code or for a different action than password reset.
   */
  async ngOnInit(): Promise<void> {
    const code = this.oobCode();
    const mode = this.mode();
    if (!code || (mode && mode !== RESET_MODE)) {
      this.codeState.set('invalid');
      return;
    }
    await this.verifyCode(code);
  }


  /**
   * Moves focus to the page heading after navigation.
   */
  ngAfterViewInit(): void {
    this.title()?.nativeElement.focus({ preventScroll: true });
  }


  /**
   * Asks Firebase whether the reset code is still valid.
   * @param code Firebase oobCode query parameter.
   */
  private async verifyCode(code: string): Promise<void> {
    try {
      await this.authService.verifyResetCode(code);
      this.codeState.set('valid');
    } catch (error: unknown) {
      this.markInvalid(error);
    }
  }


  /**
   * Switches to the invalid-link state with a message specific to the
   * Firebase error code (expired vs. invalid/used); generic fallback.
   * @param error Error thrown while verifying the reset code.
   */
  private markInvalid(error: unknown): void {
    const code = error instanceof FirebaseError ? error.code : '';
    this.codeError.set(CODE_ERROR_MESSAGES[code] ?? DEFAULT_INVALID_MESSAGE);
    this.codeState.set('invalid');
  }


  /**
   * Resolves the visible error message for the password control.
   */
  protected passwordError(): string {
    const control = this.form.controls.password;
    if (!control.touched || !control.errors) return '';
    const key = Object.keys(control.errors)[0];
    return PASSWORD_ERROR_MESSAGES[key] ?? '';
  }


  /**
   * Resolves the visible error message for the confirmation control.
   */
  protected confirmError(): string {
    const control = this.form.controls.confirm;
    if (!control.touched) return '';
    if (control.errors?.['required']) return 'Bitte bestätige dein Passwort';
    if (this.form.errors?.['passwordMismatch']) return PASSWORD_MISMATCH_MESSAGE;
    return '';
  }


  /**
   * Reports whether the confirmation should be marked invalid.
   */
  protected isConfirmInvalid(): boolean {
    return this.form.controls.confirm.touched && this.confirmError() !== '';
  }


  /**
   * Reports whether the password control should be marked invalid.
   */
  protected isPasswordInvalid(): boolean {
    const control = this.form.controls.password;
    return control.touched && control.invalid;
  }


  /**
   * Sets the new password for the verified reset code.
   */
  protected async submit(): Promise<void> {
    const code = this.oobCode();
    if (this.form.invalid || this.isPending() || !code) return;
    this.isPending.set(true);
    this.generalError.set('');
    try {
      await this.authService.completePasswordReset(code, this.form.getRawValue().password);
      this.finishSuccessfully();
    } catch (error: unknown) {
      this.handleResetError(error);
    } finally {
      this.isPending.set(false);
    }
  }


  /**
   * Shows the confirmation, then continues to the authorized continue URL
   * if present, otherwise to the login page.
   */
  private finishSuccessfully(): void {
    this.toast.show(TOAST_MESSAGE);
    const target = this.safeContinueUrl();
    if (target) {
      window.location.assign(target);
      return;
    }
    this.router.navigate(['/auth/login']);
  }


  /**
   * Returns the continue URL only when it is same-origin (an authorized
   * target), guarding against open redirects; null otherwise.
   */
  private safeContinueUrl(): string | null {
    const url = this.continueUrl();
    if (!url) return null;
    try {
      return new URL(url).origin === window.location.origin ? url : null;
    } catch {
      return null;
    }
  }


  /**
   * Shows a specific inline error for invalid/expired/used codes and for
   * a server-side policy rejection, or a general message otherwise.
   * @param error Unknown error thrown by the reset request.
   */
  private handleResetError(error: unknown): void {
    const code = error instanceof FirebaseError ? error.code : '';
    if (WEAK_PASSWORD_CODES.includes(code)) {
      this.generalError.set(PASSWORD_TOO_SHORT_MESSAGE);
      return;
    }
    this.generalError.set(CODE_ERROR_MESSAGES[code] ?? GENERAL_ERROR_MESSAGE);
  }


  /**
   * Returns to the login page.
   */
  protected goBack(): void {
    this.router.navigate(['/auth/login']);
  }
}
