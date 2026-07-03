/**
 * @file Landing page for Firebase e-mail action links. The web server
 * bridges the path URL /auth-action?mode=…&oobCode=… to this hash route;
 * password resets complete inline, other modes show a neutral notice.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FirebaseError } from 'firebase/app';

import { AuthService } from '../../../services/auth.service';
import { PasswordInputComponent } from '../../../shared/password-input/password-input.component';

const RESET_MODE = 'resetPassword';
const PARAM_MODE = 'mode';
const PARAM_CODE = 'oobCode';
const PASSWORD_MIN_LENGTH = 6;
const WEAK_PASSWORD_CODE = 'auth/weak-password';
const RESET_TITLE = 'Passwort zurücksetzen';
const NOTICE_TITLE = 'E-Mail-Aktion';
const DEFAULT_INVALID_MESSAGE = 'Dieser Link ist abgelaufen oder ungültig.';
const WEAK_PASSWORD_MESSAGE =
  'Dein Passwort ist zu schwach. Bitte wähle ein längeres oder komplexeres Passwort.';
const GENERAL_ERROR_MESSAGE = 'Das hat leider nicht geklappt. Bitte versuche es später erneut.';
const CODE_ERROR_MESSAGES: Record<string, string> = {
  'auth/expired-action-code': 'Dieser Link ist abgelaufen. Bitte fordere einen neuen an.',
  'auth/invalid-action-code':
    'Dieser Link ist ungültig oder wurde bereits verwendet. Bitte fordere einen neuen an.',
};

const PASSWORD_ERROR_MESSAGES: Record<string, string> = {
  required: 'Bitte gib ein neues Passwort ein',
  minlength: `Dein Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein`,
};

/** Display state of the action page. */
type ActionState = 'checking' | 'form' | 'success' | 'invalid' | 'notice';

/**
 * Handles Firebase auth action links: verifies password-reset codes, lets
 * the user set a new password and reports invalid or unsupported actions
 * without ever crashing on unknown modes.
 */
@Component({
  selector: 'app-auth-action',
  imports: [ReactiveFormsModule, RouterLink, PasswordInputComponent],
  templateUrl: './auth-action.component.html',
  styleUrl: './auth-action.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthActionComponent implements OnInit, AfterViewInit {
  private readonly authService = inject(AuthService);

  private readonly route = inject(ActivatedRoute);

  private readonly formBuilder = inject(NonNullableFormBuilder);

  private readonly title = viewChild<ElementRef<HTMLHeadingElement>>('title');

  protected readonly state = signal<ActionState>('checking');

  protected readonly email = signal('');

  protected readonly invalidMessage = signal(DEFAULT_INVALID_MESSAGE);

  protected readonly generalError = signal('');

  protected readonly isPending = signal(false);

  private oobCode = '';

  protected readonly form = this.formBuilder.group({
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
  });


  /**
   * Routes the request by its action mode: password resets verify the code,
   * every other or missing mode ends in the neutral notice state.
   */
  async ngOnInit(): Promise<void> {
    const mode = this.readParam(PARAM_MODE);
    this.oobCode = this.readParam(PARAM_CODE);
    if (mode !== RESET_MODE) {
      this.state.set('notice');
      return;
    }
    if (!this.oobCode) {
      this.state.set('invalid');
      return;
    }
    await this.verifyCode(this.oobCode);
  }


  /**
   * Moves focus to the page heading after navigation.
   */
  ngAfterViewInit(): void {
    this.title()?.nativeElement.focus({ preventScroll: true });
  }


  /**
   * Resolves the page heading for the current state.
   */
  protected pageTitle(): string {
    return this.state() === 'notice' ? NOTICE_TITLE : RESET_TITLE;
  }


  /**
   * Reads an action parameter defensively: hash-route query params first,
   * then the live pre-fragment search string, then the originally requested
   * document URL — Angular's initial hash navigation rewrites the URL via
   * a base-relative replaceState and drops the search before init.
   * @param name Query parameter name.
   */
  private readParam(name: string): string {
    const fromRoute = this.route.snapshot.queryParamMap.get(name);
    const fromSearch = new URLSearchParams(window.location.search).get(name);
    return fromRoute ?? fromSearch ?? this.initialUrlParam(name) ?? '';
  }


  /**
   * Reads a parameter from the search string of the document URL recorded
   * by the navigation timing entry, which survives history rewrites.
   * @param name Query parameter name.
   */
  private initialUrlParam(name: string): string | null {
    const entry = performance.getEntriesByType('navigation')[0];
    if (!entry?.name) return null;
    try {
      return new URL(entry.name).searchParams.get(name);
    } catch {
      return null;
    }
  }


  /**
   * Asks Firebase whether the reset code is valid and shows the form with
   * the resolved account e-mail on success.
   * @param code Firebase oobCode parameter.
   */
  private async verifyCode(code: string): Promise<void> {
    try {
      this.email.set(await this.authService.verifyResetCode(code));
      this.state.set('form');
    } catch (error: unknown) {
      this.markInvalid(error);
    }
  }


  /**
   * Switches to the invalid-link state with a message specific to the
   * Firebase error code (expired vs. invalid/used); generic fallback.
   * @param error Error thrown by the Firebase action call.
   */
  private markInvalid(error: unknown): void {
    const code = error instanceof FirebaseError ? error.code : '';
    this.invalidMessage.set(CODE_ERROR_MESSAGES[code] ?? DEFAULT_INVALID_MESSAGE);
    this.state.set('invalid');
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
   * Reports whether the password control should be marked invalid.
   */
  protected isPasswordInvalid(): boolean {
    const control = this.form.controls.password;
    return control.touched && control.invalid;
  }


  /**
   * Sets the new password for the verified reset code and switches to the
   * success state.
   */
  protected async submit(): Promise<void> {
    if (this.form.invalid || this.isPending()) return;
    this.isPending.set(true);
    this.generalError.set('');
    try {
      await this.authService.completePasswordReset(this.oobCode, this.form.getRawValue().password);
      this.state.set('success');
    } catch (error: unknown) {
      this.handleSubmitError(error);
    } finally {
      this.isPending.set(false);
    }
  }


  /**
   * Maps submit failures to inline messages: code errors switch to the
   * invalid-link state, weak passwords and unknown failures stay inline.
   * @param error Unknown error thrown by the reset request.
   */
  private handleSubmitError(error: unknown): void {
    const code = error instanceof FirebaseError ? error.code : '';
    if (code in CODE_ERROR_MESSAGES) {
      this.markInvalid(error);
      return;
    }
    this.generalError.set(code === WEAK_PASSWORD_CODE ? WEAK_PASSWORD_MESSAGE : GENERAL_ERROR_MESSAGE);
  }
}
