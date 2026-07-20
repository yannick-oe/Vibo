/**
 * @file Account-security operations on top of Firebase Auth: e-mail
 * verification (send with a verify-screen continue link, confirm with a
 * forced token refresh plus a bounded claim poll, and the guard's
 * stale-flag/stale-claim safety nets for restored sessions) and the in-app
 * password change with re-authentication. Pure Auth concerns — this
 * service never touches Firestore.
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

const VERIFY_EMAIL_CONTINUE_FRAGMENT = '#/auth/verify-email';

const VERIFIED_CLAIM = 'email_verified';

const STALE_CLAIM_ERROR = 'Verified-e-mail claim still missing after a forced token refresh.';

const CLAIM_POLL_ATTEMPTS = 5;

const CLAIM_POLL_DELAY_MS = 400;

/** Outcome of a verification confirmation attempt on the verify screen. */
export type VerifyOutcome = 'verified' | 'unverified' | 'failed';


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
   * Reads the cached ID token's claims, forces a refresh when the
   * verified-e-mail claim has not caught up with the account state yet and
   * re-reads the refreshed token: the caller only ever proceeds on a token
   * that provably carries the claim, never on the refresh call alone.
   * @param user Signed-in Firebase user with a verified address.
   */
  private async refreshStaleClaim(user: User): Promise<void> {
    const cached = await this.inContext(() => getIdTokenResult(user));
    if (cached.claims[VERIFIED_CLAIM] === true) return;
    await this.inContext(() => getIdToken(user, true));
    const refreshed = await this.inContext(() => getIdTokenResult(user));
    if (refreshed.claims[VERIFIED_CLAIM] !== true) throw new Error(STALE_CLAIM_ERROR);
  }


  /**
   * Guard net for restored sessions and second devices: the SDK's persisted
   * `emailVerified` flag can be stale after the address was verified
   * externally (mail-link tab, another device). Reloads the account once so
   * the guard decides on current server state; a failed reload (offline) is
   * tolerated — the stale flag then routes to the verification screen,
   * whose auto-continue retries. No-op for verified users and the guest.
   * @param user Signed-in Firebase user about to be routed.
   */
  async refreshStaleVerification(user: User): Promise<void> {
    if (user.emailVerified || user.email === environment.guestEmail) return;
    await this.inContext(() => reload(user)).catch(() => undefined);
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
   * Sends the verification e-mail. The continue link targets the verify
   * screen (deployment-aware base from `document.baseURI` plus the
   * hash-routed verify route) instead of the app: the mail-link tab lands
   * on a screen with zero Firestore access, whose auto-continue proves the
   * refreshed token claim before any app stream can start.
   */
  sendVerificationEmail(): Promise<void> {
    const currentUser = this.requireUser();
    const settings = { url: `${document.baseURI}${VERIFY_EMAIL_CONTINUE_FRAGMENT}` };
    return this.inContext(() => sendEmailVerification(currentUser, settings));
  }


  /**
   * Reloads the account and, once verified, forces an ID-token refresh and
   * polls the token claims until the Firestore security rules provably see
   * `email_verified = true`; only then may the caller navigate into the
   * app. A confirmed claim also fills the session success cache.
   * @returns 'verified' on a proven claim, 'unverified' while the address
   * is still unconfirmed, 'failed' when the claim never became visible.
   */
  async confirmVerified(): Promise<VerifyOutcome> {
    const currentUser = this.requireUser();
    await this.inContext(() => reload(currentUser));
    if (!currentUser.emailVerified) return 'unverified';
    await this.inContext(() => getIdToken(currentUser, true));
    if (!(await this.awaitVerifiedClaim(currentUser))) return 'failed';
    this.freshClaimUid = currentUser.uid;
    return 'verified';
  }


  /**
   * Polls the ID-token claims with bounded retries; every retry forces a
   * fresh token first, so a propagation delay on the Auth backend cannot
   * park the client on a stale claim forever.
   * @param user Signed-in Firebase user whose address is verified.
   */
  private async awaitVerifiedClaim(user: User): Promise<boolean> {
    for (let attempt = 0; attempt < CLAIM_POLL_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await delay(CLAIM_POLL_DELAY_MS);
        await this.inContext(() => getIdToken(user, true));
      }
      const result = await this.inContext(() => getIdTokenResult(user));
      if (result.claims[VERIFIED_CLAIM] === true) return true;
    }
    return false;
  }


  /**
   * Whether the verify screen should auto-run the confirmation on load:
   * a user is signed in and it is not the guest account (which never
   * verifies and cannot reach the screen through the guards anyway).
   */
  shouldAutoConfirm(): boolean {
    const currentUser = this.auth.currentUser;
    return currentUser !== null && currentUser.email !== environment.guestEmail;
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


/**
 * Resolves after the given pause; backs the bounded claim-poll retries.
 * @param ms Milliseconds to wait.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
