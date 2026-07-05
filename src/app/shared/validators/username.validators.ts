/**
 * @file Shared validation for the immutable @username handle: normalization,
 * structural and profanity rules with German messages, plus the derivation
 * helpers used to auto-claim a handle for Google sign-ins. Reuses the shared
 * profanity check so username and display-name moderation stay in sync.
 */
import { AbstractControl, ValidationErrors } from '@angular/forms';

import { isProfane } from './display-name.validators';

/** Smallest accepted username length, counted on the normalized value. */
export const USERNAME_MIN_LENGTH = 3;

/** Largest accepted username length, counted on the normalized value. */
export const USERNAME_MAX_LENGTH = 20;

const USERNAME_PATTERN = /^[a-z0-9]+(?:[._][a-z0-9]+)*$/;
const DIACRITIC_PATTERN = /[\u0300-\u036f]/g;
const SHARP_S_PATTERN = /ß/g;
const SHARP_S_REPLACEMENT = 'ss';
const INVALID_CHAR_RUN_PATTERN = /[^a-z0-9._]+/g;
const SEPARATOR_RUN_PATTERN = /[._]{2,}/g;
const EDGE_SEPARATOR_PATTERN = /^[._]+|[._]+$/g;
const DERIVED_SEPARATOR = '.';
const FALLBACK_USERNAME = 'user';
const UID_SUFFIX_LENGTH = 6;
const UID_SUFFIX_SEPARATOR = '_';
const ERROR_PRIORITY = ['required', 'minlength', 'maxlength', 'pattern', 'profanity', 'taken'];

/** German error messages keyed by the error returned from the validators. */
export const USERNAME_ERRORS: Record<string, string> = {
  required: 'Bitte gib einen Benutzernamen ein.',
  minlength: `Dein Benutzername muss mindestens ${USERNAME_MIN_LENGTH} Zeichen lang sein.`,
  maxlength: `Dein Benutzername darf höchstens ${USERNAME_MAX_LENGTH} Zeichen lang sein.`,
  pattern: 'Nur Kleinbuchstaben, Zahlen, Punkt und Unterstrich.',
  profanity: 'Dieser Benutzername ist nicht erlaubt.',
  taken: 'Dieser Benutzername ist bereits vergeben.',
};


/**
 * Normalizes a username for validation and persistence: trims the ends and
 * lowercases, so the stored handle and the registry doc id are canonical.
 * @param value Raw input value.
 */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}


/**
 * Computes the single highest-priority username error for a raw value, or
 * null when the value is acceptable. Pure, so it is reusable outside forms.
 * @param value Raw input value.
 */
export function usernameErrors(value: string): ValidationErrors | null {
  const username = normalizeUsername(value);
  if (!username) return { required: true };
  if (username.length < USERNAME_MIN_LENGTH) return { minlength: true };
  if (username.length > USERNAME_MAX_LENGTH) return { maxlength: true };
  if (!USERNAME_PATTERN.test(username)) return { pattern: true };
  if (isProfane(username)) return { profanity: true };
  return null;
}


/**
 * Coerces an unknown control value to a string without using `any`.
 * @param value Raw control value.
 */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}


/**
 * Angular reactive-forms validator wrapping the shared username rules.
 * @param control Control holding the username.
 */
export function usernameValidator(control: AbstractControl): ValidationErrors | null {
  return usernameErrors(asString(control.value));
}


/**
 * Resolves the German message for a validation-error map, honoring the
 * required → length → pattern → profanity → taken priority.
 * @param errors Validation errors of the control, or null.
 */
export function usernameErrorMessage(errors: ValidationErrors | null): string {
  if (!errors) return '';
  const key = ERROR_PRIORITY.find(name => name in errors);
  return key ? USERNAME_ERRORS[key] : '';
}


/**
 * Derives a policy-conforming username base from a free-form source (Google
 * display name or e-mail local part): folds to the allowed charset, collapses
 * separator runs, trims edges and clamps; falls back to a neutral handle
 * when the result is too short or profane.
 * @param source Free-form name or e-mail local part.
 */
export function deriveUsernameBase(source: string): string {
  const folded = source
    .toLowerCase()
    .replace(SHARP_S_PATTERN, SHARP_S_REPLACEMENT)
    .normalize('NFD')
    .replace(DIACRITIC_PATTERN, '');
  const sanitized = folded
    .replace(INVALID_CHAR_RUN_PATTERN, DERIVED_SEPARATOR)
    .replace(SEPARATOR_RUN_PATTERN, DERIVED_SEPARATOR)
    .replace(EDGE_SEPARATOR_PATTERN, '');
  const clamped = sanitized.slice(0, USERNAME_MAX_LENGTH).replace(EDGE_SEPARATOR_PATTERN, '');
  return clamped.length < USERNAME_MIN_LENGTH || isProfane(clamped) ? FALLBACK_USERNAME : clamped;
}


/**
 * Appends a short uid-derived suffix to a taken base, keeping the result
 * inside the length bounds and free of adjacent separators.
 * @param base Derived username base that turned out to be taken.
 * @param uid Firebase Auth uid of the claiming user.
 */
export function withUidSuffix(base: string, uid: string): string {
  const suffix = UID_SUFFIX_SEPARATOR + uid.slice(0, UID_SUFFIX_LENGTH).toLowerCase();
  const room = USERNAME_MAX_LENGTH - suffix.length;
  const head = base.slice(0, room).replace(EDGE_SEPARATOR_PATTERN, '');
  return head + suffix;
}
