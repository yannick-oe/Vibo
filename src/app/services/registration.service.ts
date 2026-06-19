/**
 * @file Holds in-progress registration data shared between the form step,
 * the avatar step and the signup error transport back to the form.
 */
import { Injectable, computed, signal } from '@angular/core';

export const DEFAULT_AVATAR_PATH = 'avatars/gast.jpeg';

export const REMOTE_AVATAR_PREFIX = 'http';

/**
 * Resolves a stored avatar reference to a local asset path: local paths pass
 * through, missing or remote (e.g. Google photoURL) values fall back to the
 * neutral placeholder.
 * @param path Stored avatarPath (local asset path), or null/undefined.
 */
export function resolveAvatarPath(path?: string | null): string {
  return path && !path.startsWith(REMOTE_AVATAR_PREFIX) ? path : DEFAULT_AVATAR_PATH;
}

/** Values collected by the registration form step. */
export interface RegistrationFormData {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

/** Field-specific signup error transported back to the form step. */
export interface SignupFieldError {
  readonly field: 'email' | 'password';
  readonly message: string;
}

/**
 * Signal-based state container for the two-step registration flow.
 */
@Injectable({ providedIn: 'root' })
export class RegistrationService {
  private readonly formData = signal<RegistrationFormData | null>(null);

  readonly data = this.formData.asReadonly();

  readonly hasFormData = computed(() => this.formData() !== null);

  readonly avatarPath = signal<string>(DEFAULT_AVATAR_PATH);

  readonly fieldError = signal<SignupFieldError | null>(null);


  /**
   * Stores the values of the form step.
   * @param data Validated name, e-mail and password.
   */
  setFormData(data: RegistrationFormData): void {
    this.formData.set(data);
  }


  /**
   * Clears all registration state after success or abort.
   */
  reset(): void {
    this.formData.set(null);
    this.avatarPath.set(DEFAULT_AVATAR_PATH);
    this.fieldError.set(null);
  }
}
