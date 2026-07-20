/**
 * @file Shared password validation constants and the cross-field match
 * validator. The minimum length mirrors the Firebase project's password
 * policy (minimum 8 characters, no complexity requirements, enforcement
 * on); the live policy itself is additionally checked via the SDK's
 * validatePassword (see AccountSecurityService.passwordPolicyValidator).
 */
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Minimum password length (mirrors the Firebase password policy). */
export const MIN_PASSWORD_LENGTH = 8;

/** German message for a too-short or policy-rejected password. */
export const PASSWORD_TOO_SHORT_MESSAGE = `Dein Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein`;

/** German message for a non-matching password confirmation. */
export const PASSWORD_MISMATCH_MESSAGE = 'Deine Passwörter stimmen nicht überein';

/**
 * Firebase error codes signalling a policy-rejected password: the legacy
 * weak-password code and the enumeration-era policy rejection.
 */
export const WEAK_PASSWORD_CODES = [
  'auth/weak-password',
  'auth/password-does-not-meet-requirements',
];

/**
 * Firebase error codes signalling a wrong password on sign-in or
 * re-authentication: the legacy code plus both enumeration-protected
 * variants newer SDK generations emit.
 */
export const WRONG_PASSWORD_CODES = [
  'auth/invalid-credential',
  'auth/invalid-login-credentials',
  'auth/wrong-password',
];


/**
 * Builds a group validator reporting a mismatch between a password control
 * and its confirmation control.
 * @param passwordKey Form key of the password control.
 * @param confirmKey Form key of the confirmation control.
 */
export function matchingPasswordsValidator(passwordKey: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordKey)?.value;
    const confirm = group.get(confirmKey)?.value;
    return password === confirm ? null : { passwordMismatch: true };
  };
}
