/**
 * @file Shared display-name validation: normalization, length/required and
 * best-effort profanity rules, exposed both as pure helpers and as an Angular
 * validator so the profile editor and the registration form stay in sync.
 */
import { AbstractControl, ValidationErrors } from '@angular/forms';

import { PROFANITY_BLOCKLIST } from './profanity-blocklist';

/** Smallest accepted display name length, counted on the normalized value. */
export const NAME_MIN_LENGTH = 2;

/** Largest accepted display name length, counted on the normalized value. */
export const NAME_MAX_LENGTH = 20;

const LEET_MAP: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };
const LEET_PATTERN = /[013457]/g;
const DIACRITIC_PATTERN = /[\u0300-\u036f]/g;
const SHARP_S_PATTERN = /ß/g;
const SHARP_S_REPLACEMENT = 'ss';
const NON_ALNUM_PATTERN = /[^a-z0-9]/g;
const WHITESPACE_PATTERN = /\s+/g;
const ERROR_PRIORITY = ['required', 'minlength', 'maxlength', 'profanity'];

/** German error messages keyed by the error returned from the validator. */
export const DISPLAY_NAME_ERRORS: Record<string, string> = {
  required: 'Bitte gib deinen Namen ein.',
  minlength: `Dein Name muss mindestens ${NAME_MIN_LENGTH} Zeichen lang sein.`,
  maxlength: `Dein Name darf höchstens ${NAME_MAX_LENGTH} Zeichen lang sein.`,
  profanity: 'Dieser Name ist nicht erlaubt.',
};


/**
 * Normalizes a display name for storage and length checks: trims the ends and
 * collapses internal whitespace runs to a single space.
 * @param value Raw input value.
 */
export function normalizeName(value: string): string {
  return value.trim().replace(WHITESPACE_PATTERN, ' ');
}


/**
 * Normalizes a string for blocklist matching: lowercases, maps the German
 * sharp s, strips diacritics, resolves common leetspeak digits and drops
 * every non-alphanumeric character.
 * @param value String to fold into a comparable form.
 */
export function normalizeForMatch(value: string): string {
  const lowered = value.toLowerCase().replace(SHARP_S_PATTERN, SHARP_S_REPLACEMENT);
  const deaccented = lowered.normalize('NFD').replace(DIACRITIC_PATTERN, '');
  const deleeted = deaccented.replace(LEET_PATTERN, char => LEET_MAP[char]);
  return deleeted.replace(NON_ALNUM_PATTERN, '');
}


const BLOCKED_TERMS: ReadonlySet<string> = new Set(PROFANITY_BLOCKLIST.map(normalizeForMatch));


/**
 * Reports whether a name is offensive, matching conservatively: the whole
 * normalized string and each normalized whitespace token are compared against
 * the blocklist, never raw substrings (avoids the Scunthorpe problem).
 * @param value Raw input value.
 */
export function isProfane(value: string): boolean {
  const collapsed = normalizeName(value);
  if (BLOCKED_TERMS.has(normalizeForMatch(collapsed))) return true;
  return collapsed.split(' ').some(token => BLOCKED_TERMS.has(normalizeForMatch(token)));
}


/**
 * Builds an Angular length-error detail object.
 * @param requiredLength Boundary the value violated.
 * @param actualLength Normalized length of the value.
 */
function lengthDetail(requiredLength: number, actualLength: number): ValidationErrors {
  return { requiredLength, actualLength };
}


/**
 * Computes the single highest-priority display-name error for a raw value, or
 * null when the value is acceptable. Pure, so signal-based UIs can reuse it.
 * @param value Raw input value.
 */
export function displayNameErrors(value: string): ValidationErrors | null {
  const name = normalizeName(value);
  if (!name) return { required: true };
  if (name.length < NAME_MIN_LENGTH) return { minlength: lengthDetail(NAME_MIN_LENGTH, name.length) };
  if (name.length > NAME_MAX_LENGTH) return { maxlength: lengthDetail(NAME_MAX_LENGTH, name.length) };
  if (isProfane(value)) return { profanity: true };
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
 * Angular reactive-forms validator wrapping the shared display-name rules.
 * @param control Control holding the display name.
 */
export function displayNameValidator(control: AbstractControl): ValidationErrors | null {
  return displayNameErrors(asString(control.value));
}


/**
 * Resolves the German message for a validation-error map, honoring the
 * required → length → profanity priority; empty when there is no error.
 * @param errors Validation errors of the control, or null.
 */
export function displayNameErrorMessage(errors: ValidationErrors | null): string {
  if (!errors) return '';
  const key = ERROR_PRIORITY.find(name => name in errors);
  return key ? DISPLAY_NAME_ERRORS[key] : '';
}
