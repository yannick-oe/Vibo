/**
 * @file Account-security operations on top of Firebase Auth: e-mail
 * verification (send, confirm with a forced token refresh, and the guard's
 * stale-claim safety net for restored sessions) and the in-app password
 * change with re-authentication. Pure Auth concerns — this service never
 * touches Firestore.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Auth,
  EmailAuthProvider,
  User,
  getIdToken,
  getIdTokenResult,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  updatePassword,
  validatePassword,
} from '@angular/fire/auth';
import { AsyncValidatorFn, ValidationErrors } from '@angular/forms';
import { first, from, switchMap, timer } from 'rxjs';

import { environment } from '../../environments/environment';

const NOT_SIGNED_IN_ERROR = 'Operation requires a signed-in user.';

const PASSWORD_PROVIDER_ID = 'password';

const PASSWORD_CHECK_DEBOUNCE_MS = 200;


/**
 * Whether a user may enter the app area: the e-mail is verified or the
 * account is the shared guest account, which is deliberately exempt from
 * verification (it signs in with fixed demo credentials).
 * @param user Signed-in Firebase user.
 */
export function isVerifiedOrGuest(user: User): boolean {
  return user.emailVerified || user.email === environment.guestEmail;
}


/**
 * E-mail verification and password management for the signed-in account.
 * All Firebase calls run in the injection context as required by
 * AngularFire, because the methods are invoked from event handlers.
 */
@Injectable({ providedIn: 'root' })
export class AccountSecurityService {
  private readonly auth = inject(Auth);

  private readonly injector = inject(EnvironmentInjector);

  private freshClaimUid: string | null = null;


  /**
   * Guard safety net for restored sessions (e.g. the continueUrl tab of the
   * verification mail): the SDK may report `emailVerified` from refreshed
   * account info while the cached ID token still carries a stale
   * `email_verified = false` claim — and the Firestore rules only see the
   * token. Checks the claim once per session (cached per uid afterwards)
   * and forces a token refresh when it is stale.
   * @param user Signed-in Firebase user entering the app area.
   * @returns False when the claim could not be refreshed (e.g. offline).
   */
  async ensureVerifiedTokenClaim(user: User): Promise<boolean> {
    if (!this.needsClaimCheck(user)) return true;
    try {
      await this.refreshStaleClaim(user);
      this.freshClaimUid = user.uid;
      return true;
    } catch {
      return false;
    }
  }


  /**
   * Whether the token-claim check applies: only verified non-guest accounts
   * are gated by the claim, and a passed check is cached for the session.
   * @param user Signed-in Firebase user.
   */
  private needsClaimCheck(user: User): boolean {
    if (!user.emailVerified || user.email === environment.guestEmail) return false;
    return this.freshClaimUid !== user.uid;
  }


  /**
   * Reads the cached ID token's claims and forces a refresh when the
   * verified-e-mail claim has not caught up with the account state yet.
   * @param user Signed-in Firebase user with a verified address.
   */
  private async refreshStaleClaim(user: User): Promise<void> {
    const result = await this.inContext(() => getIdTokenResult(user));
    if (result.claims['email_verified'] === true) return;
    await this.inContext(() => getIdToken(user, true));
  }


  /**
   * Whether the signed-in account still needs to verify its e-mail before
   * it may enter the app area; false while signed out.
   */
  needsVerification(): boolean {
    const currentUser = this.auth.currentUser;
    return currentUser !== null && !isVerifiedOrGuest(currentUser);
  }


  /**
   * E-mail address of the signed-in account, for display on the
   * verification screen; empty while signed out.
   */
  currentEmail(): string {
    return this.auth.currentUser?.email ?? '';
  }


  /**
   * Sends the verification e-mail. The continue link points at the
   * deployment-aware app base (`document.baseURI`, hash-routed), matching
   * the password-reset flow, so it is correct on both deployments.
   */
  sendVerificationEmail(): Promise<void> {
    const currentUser = this.requireUser();
    const settings = { url: document.baseURI };
    return this.inContext(() => sendEmailVerification(currentUser, settings));
  }


  /**
   * Reloads the account and, once verified, forces an ID-token refresh so
   * the Firestore security rules see `email_verified = true` immediately.
   * @returns Whether the e-mail is verified now.
   */
  async confirmVerified(): Promise<boolean> {
    const currentUser = this.requireUser();
    await this.inContext(() => reload(currentUser));
    if (!currentUser.emailVerified) return false;
    await this.inContext(() => getIdToken(currentUser, true));
    return true;
  }


  /**
   * Whether the signed-in account can change a password here: it owns an
   * e-mail/password credential (Google-only accounts have none).
   */
  hasPasswordProvider(): boolean {
    const providers = this.auth.currentUser?.providerData ?? [];
    return providers.some(provider => provider.providerId === PASSWORD_PROVIDER_ID);
  }


  /**
   * Changes the account password after re-authenticating with the current
   * one (Firebase requires a recent login for this operation).
   * @param currentPassword Password entered as the current one.
   * @param newPassword Validated new password.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const currentUser = this.requireUser();
    const credential = EmailAuthProvider.credential(currentUser.email ?? '', currentPassword);
    await this.inContext(() => reauthenticateWithCredential(currentUser, credential));
    await this.inContext(() => updatePassword(currentUser, newPassword));
  }


  /**
   * Async validator checking a typed password against the live Firebase
   * password policy (minimum 8 characters, no complexity requirements) via
   * the SDK's validatePassword; the policy document is fetched once and
   * cached by the SDK, later checks run locally.
   */
  passwordPolicyValidator(): AsyncValidatorFn {
    return control =>
      timer(PASSWORD_CHECK_DEBOUNCE_MS).pipe(
        switchMap(() => from(this.checkPasswordPolicy(String(control.value ?? '')))),
        first(),
      );
  }


  /**
   * Runs the SDK policy check; empty values pass (required/minlength
   * handle those) and a failed policy fetch passes too, because the server
   * enforces the policy at submit time anyway.
   * @param password Typed password to validate.
   */
  private async checkPasswordPolicy(password: string): Promise<ValidationErrors | null> {
    if (!password) return null;
    try {
      const status = await this.inContext(() => validatePassword(this.auth, password));
      return status.isValid ? null : { passwordPolicy: true };
    } catch {
      return null;
    }
  }


  /**
   * Returns the signed-in Firebase user or fails fast when signed out.
   */
  private requireUser(): User {
    const currentUser = this.auth.currentUser;
    if (!currentUser) throw new Error(NOT_SIGNED_IN_ERROR);
    return currentUser;
  }


  /**
   * Runs a Firebase API call in the injection context; required because
   * AngularFire warns about calls scheduled from event handlers.
   * @param operation Firebase call to execute.
   */
  private inContext<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
