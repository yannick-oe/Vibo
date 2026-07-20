/**
 * @file Registration form step: collects username, e-mail, password and
 * consent, including the debounced availability check of the @handle.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  inject,
  viewChild,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { APP_NAME } from '../../../shared/app.constants';
import { PasswordInputComponent } from '../../../shared/password-input/password-input.component';
import { AccountSecurityService } from '../../../services/account-security.service';
import { RegistrationService } from '../../../services/registration.service';
import { UsernameService } from '../../../services/username.service';
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_TOO_SHORT_MESSAGE,
} from '../../../shared/validators/password.validators';
import {
  USERNAME_ERRORS,
  normalizeUsername,
  usernameValidator,
} from '../../../shared/validators/username.validators';

const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  username: USERNAME_ERRORS,
  email: {
    required: 'Bitte gib deine E-Mail-Adresse ein',
    email: 'Diese E-Mail-Adresse ist leider ungültig',
  },
  password: {
    required: 'Bitte gib ein Passwort ein',
    minlength: PASSWORD_TOO_SHORT_MESSAGE,
    passwordPolicy: PASSWORD_TOO_SHORT_MESSAGE,
  },
  privacy: {
    required: 'Bitte stimme der Datenschutzerklärung zu',
  },
};

/**
 * Creates a validator that reports a Firebase signup error as long as the
 * control still holds the rejected value. Survives re-validation by the
 * forms runtime and clears itself once the user edits the field.
 * @param rejectedValue Value that Firebase rejected.
 * @param message German error message to show.
 */
function rejectedValueValidator(rejectedValue: string, message: string): ValidatorFn {
  return control => (control.value === rejectedValue ? { firebase: message } : null);
}

/**
 * First step of the registration flow. Persists its values in the
 * RegistrationService and continues to the avatar step when valid.
 */
@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, PasswordInputComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent implements OnInit, AfterViewInit {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  private readonly registration = inject(RegistrationService);

  private readonly usernameService = inject(UsernameService);

  private readonly accountSecurity = inject(AccountSecurityService);

  private readonly router = inject(Router);

  private readonly title = viewChild<ElementRef<HTMLHeadingElement>>('title');

  protected readonly appName = APP_NAME;

  protected readonly form = this.formBuilder.group({
    username: ['', [usernameValidator], [this.usernameService.availabilityValidator()]],
    email: ['', [Validators.required, Validators.email]],
    password: [
      '',
      [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)],
      [this.accountSecurity.passwordPolicyValidator()],
    ],
    privacy: [false, Validators.requiredTrue],
  });

  protected isUsernameFocused = false;
  protected isEmailFocused = false;
  protected isPasswordFocused = false;


  /**
   * Restores persisted step values and applies a transported signup error.
   */
  ngOnInit(): void {
    const data = this.registration.data();
    if (data) this.form.patchValue(data);
    this.applyFieldError();
  }


  /**
   * Moves focus to the page heading after navigation.
   */
  ngAfterViewInit(): void {
    this.title()?.nativeElement.focus({ preventScroll: true });
  }


  /**
   * Applies a Firebase signup error transported back from the avatar step.
   */
  private applyFieldError(): void {
    const error = this.registration.fieldError();
    if (!error) return;
    const control = this.form.get(error.field);
    if (!control) return;
    control.addValidators(rejectedValueValidator(control.value, error.message));
    control.updateValueAndValidity();
    control.markAsTouched();
    this.registration.fieldError.set(null);
  }


  /**
   * Resolves the visible error message for a control.
   * @param controlName Form control key.
   * @returns Message text, or an empty string when valid or untouched.
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
   * Stops event bubbling so the privacy link does not toggle the checkbox.
   * @param event Click event on the link inside the checkbox label.
   */
  protected stopEvent(event: Event): void {
    event.stopPropagation();
  }


  /**
   * Stores the form values and continues to the avatar step. Requires a
   * fully valid form, which also blocks the pending availability check.
   */
  protected continueToAvatar(): void {
    if (!this.form.valid) return;
    const { username, email, password } = this.form.getRawValue();
    this.registration.setFormData({ username: normalizeUsername(username), email, password });
    this.router.navigate(['/auth/register/avatar']);
  }
}
