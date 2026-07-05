/**
 * @file Username registry access: availability checks against the usernames
 * collection, batched claim writes for atomic registration, the debounced
 * async form validator and the auto-derivation for Google sign-ins.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { AsyncValidatorFn } from '@angular/forms';
import {
  DocumentReference,
  Firestore,
  WriteBatch,
  doc,
  getDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import { first, from, map, switchMap, timer } from 'rxjs';

import {
  deriveUsernameBase,
  normalizeUsername,
  withUidSuffix,
} from '../shared/validators/username.validators';

/** Debounce before the availability check hits Firestore. */
export const USERNAME_CHECK_DEBOUNCE_MS = 400;

const USERNAMES_COLLECTION = 'usernames';

/**
 * Data access for the usernames/{normalizedUsername} registry that backs
 * the global uniqueness of the immutable @handle.
 */
@Injectable({ providedIn: 'root' })
export class UsernameService {
  private readonly firestore = inject(Firestore);

  private readonly injector = inject(EnvironmentInjector);


  /**
   * Reports whether a normalized username is already claimed.
   * @param username Normalized username (doc id in the registry).
   */
  async isTaken(username: string): Promise<boolean> {
    const snapshot = await this.inContext(() => getDoc(this.usernameRef(username)));
    return snapshot.exists();
  }


  /**
   * Async form validator reporting `taken` when the entered username is
   * already claimed; debounced so typing does not hit Firestore per key.
   */
  availabilityValidator(): AsyncValidatorFn {
    return control =>
      timer(USERNAME_CHECK_DEBOUNCE_MS).pipe(
        switchMap(() => from(this.isTaken(normalizeUsername(asString(control.value))))),
        map(taken => (taken ? { taken: true } : null)),
        first(),
      );
  }


  /**
   * Adds the registry claim for a username to a write batch, so the claim
   * and the user document commit atomically.
   * @param batch Firestore write batch of the surrounding operation.
   * @param username Normalized username to claim.
   * @param uid Uid of the claiming user.
   */
  reserveInBatch(batch: WriteBatch, username: string, uid: string): void {
    batch.set(this.usernameRef(username), { uid, createdAt: serverTimestamp() });
  }


  /**
   * Derives an available username for an account without a registration
   * form (Google sign-in): the sanitized base if free, otherwise the base
   * with a short uid suffix.
   * @param source Free-form display name or e-mail local part.
   * @param uid Uid of the claiming user.
   */
  async availableUsernameFor(source: string, uid: string): Promise<string> {
    const base = deriveUsernameBase(source);
    if (!(await this.isTaken(base))) return base;
    return withUidSuffix(base, uid);
  }


  /**
   * Builds the registry document reference for a normalized username.
   * @param username Normalized username (doc id in the registry).
   */
  private usernameRef(username: string): DocumentReference {
    return this.inContext(() => doc(this.firestore, `${USERNAMES_COLLECTION}/${username}`));
  }


  /**
   * Runs a Firebase API call in the injection context as AngularFire requires.
   * @param operation Firebase call to execute.
   */
  private inContext<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}


/**
 * Coerces an unknown control value to a string without using `any`.
 * @param value Raw control value.
 */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
