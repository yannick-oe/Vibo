/**
 * @file Forgot-password screen: requests a reset e-mail for an address.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FirebaseError } from 'firebase/app';

import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

const SEND_ICON = 'app-icons/send-white.svg';
const TOAST_MESSAGE = 'E-Mail gesendet';
const GENERAL_ERROR_MESSAGE = 'Das hat leider nicht geklappt. Bitte versuche es später erneut.';

const ERROR_MESSAGES: Record<string, string> = {
  required: 'Bitte gib deine E-Mail-Adresse ein',
  email: 'Diese E-Mail-Adresse ist leider ungültig',
};

/**
 * Sends a Firebase password-reset e-mail. Unknown addresses are treated as
 * success so the form does not leak which accounts exist.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent implements AfterViewInit {
  private readonly authService = inject(AuthService);

  private readonly formBuilder = inject(NonNullableFormBuilder);

  private readonly router = inject(Router);

  private readonly toast = inject(ToastService);

  private readonly title = viewChild<ElementRef<HTMLHeadingElement>>('title');

  protected readonly isPending = signal(false);

  protected readonly generalError = signal('');

  protected readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected isEmailFocused = false;


  /**
   * Moves focus to the page heading after navigation.
   */
  ngAfterViewInit(): void {
    this.title()?.nativeElement.focus({ preventScroll: true });
  }


  /**
   * Resolves the visible error message for the e-mail control.
   */
  protected emailError(): string {
    const control = this.form.controls.email;
    if (!control.touched || !control.errors) return '';
    const key = Object.keys(control.errors)[0];
    return ERROR_MESSAGES[key] ?? '';
  }


  /**
   * Reports whether the e-mail control is invalid for assistive tech.
   */
  protected isEmailInvalid(): boolean {
    const control = this.form.controls.email;
    return control.touched && control.invalid;
  }


  /**
   * Sends the reset e-mail and confirms via toast; unknown addresses are
   * deliberately treated like success.
   */
  protected async submit(): Promise<void> {
    if (this.form.invalid || this.isPending()) return;
    this.isPending.set(true);
    this.generalError.set('');
    try {
      await this.authService.sendPasswordReset(this.form.getRawValue().email);
      this.finishSuccessfully();
    } catch (error: unknown) {
      this.handleSendError(error);
    } finally {
      this.isPending.set(false);
    }
  }


  /**
   * Shows the confirmation toast and returns to the login page.
   */
  private finishSuccessfully(): void {
    this.toast.show(TOAST_MESSAGE, SEND_ICON);
    this.router.navigate(['/auth/login']);
  }


  /**
   * Treats unknown accounts as success and maps real errors to a message.
   * @param error Unknown error thrown by the reset request.
   */
  private handleSendError(error: unknown): void {
    const code = error instanceof FirebaseError ? error.code : '';
    if (code === 'auth/user-not-found') {
      this.finishSuccessfully();
      return;
    }
    this.generalError.set(GENERAL_ERROR_MESSAGE);
  }


  /**
   * Returns to the login page.
   */
  protected goBack(): void {
    this.router.navigate(['/auth/login']);
  }
}
