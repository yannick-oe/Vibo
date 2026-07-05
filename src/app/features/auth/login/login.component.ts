/**
 * @file Login card with reactive form and all three Firebase sign-in paths.
 */
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FirebaseError } from 'firebase/app';

import { AuthService } from '../../../services/auth.service';
import { FriendshipService } from '../../../services/friendship.service';
import { PasswordInputComponent } from '../../../shared/password-input/password-input.component';
import { IntroComponent } from '../intro/intro.component';

const CREDENTIALS_ERROR_MESSAGE = 'E-Mail-Adresse oder Passwort ist falsch.';
const TOO_MANY_REQUESTS_MESSAGE = 'Zu viele Versuche. Bitte warte einen Moment.';
const GENERAL_ERROR_MESSAGE = 'Das hat leider nicht geklappt. Bitte versuche es später erneut.';
const SILENT_POPUP_ERRORS = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];

const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  email: {
    required: 'Bitte gib deine E-Mail-Adresse ein',
    email: 'Diese E-Mail-Adresse ist leider ungültig',
  },
  password: {
    required: 'Bitte gib ein Passwort ein',
  },
};

/**
 * Login screen offering e-mail/password, Google popup and guest sign-in.
 * Successful sign-in navigates to the app area.
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, IntroComponent, PasswordInputComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly authService = inject(AuthService);

  private readonly friendshipService = inject(FriendshipService);

  private readonly formBuilder = inject(NonNullableFormBuilder);

  private readonly router = inject(Router);

  protected readonly isPending = signal(false);

  protected readonly generalError = signal('');

  protected readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected isEmailFocused = false;
  protected isPasswordFocused = false;


  /**
   * Resolves the visible error message for a control.
   * @param controlName Form control key.
   */
  protected errorMessage(controlName: string): string {
    const control = this.form.get(controlName);
    if (!control || !control.touched || !control.errors) return '';
    const firebaseMessage = control.errors['firebase'] as string | undefined;
    if (firebaseMessage) return firebaseMessage;
    const key = Object.keys(control.errors)[0];
    return ERROR_MESSAGES[controlName]?.[key] ?? '';
  }


  /**
   * Reports whether a control should be marked invalid for assistive tech.
   * @param controlName Form control key.
   */
  protected isInvalid(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.touched && control.invalid;
  }


  /**
   * Signs in with the form credentials.
   */
  protected async submit(): Promise<void> {
    if (this.form.invalid || this.isPending()) return;
    const { email, password } = this.form.getRawValue();
    await this.runSignIn(() => this.authService.signIn(email, password));
  }


  /**
   * Signs in via the Google popup; a closed popup is not an error.
   */
  protected async loginWithGoogle(): Promise<void> {
    if (this.isPending()) return;
    await this.runSignIn(() => this.authService.signInWithGoogle());
  }


  /**
   * Signs in to the shared guest account and seeds the demo friendship
   * with the founder so the public demo never starts socially empty.
   */
  protected async loginAsGuest(): Promise<void> {
    if (this.isPending()) return;
    await this.runSignIn(async () => {
      await this.authService.signInAsGuest();
      await this.friendshipService.ensureDemoFriendship();
    });
  }


  /**
   * Runs a sign-in call with pending state, error mapping and redirect.
   * @param signIn Sign-in operation to execute.
   */
  private async runSignIn(signIn: () => Promise<void>): Promise<void> {
    this.isPending.set(true);
    this.generalError.set('');
    try {
      await signIn();
      this.router.navigate(['/app']);
    } catch (error: unknown) {
      this.handleSignInError(error);
    } finally {
      this.isPending.set(false);
    }
  }


  /**
   * Maps Firebase sign-in errors to field or general messages.
   * @param error Unknown error thrown by the sign-in call.
   */
  private handleSignInError(error: unknown): void {
    const code = error instanceof FirebaseError ? error.code : '';
    if (SILENT_POPUP_ERRORS.includes(code)) return;
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      this.setFieldError('password', CREDENTIALS_ERROR_MESSAGE);
      return;
    }
    if (code === 'auth/user-not-found') {
      this.setFieldError('email', CREDENTIALS_ERROR_MESSAGE);
      return;
    }
    this.setGeneralError(code);
  }


  /**
   * Shows the matching general message near the buttons.
   * @param code Firebase error code.
   */
  private setGeneralError(code: string): void {
    const tooManyRequests = code === 'auth/too-many-requests';
    this.generalError.set(tooManyRequests ? TOO_MANY_REQUESTS_MESSAGE : GENERAL_ERROR_MESSAGE);
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
