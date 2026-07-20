/**
 * @file Route guards separating authenticated and unauthenticated areas.
 * All guards wait for the first Firebase auth-state emission so restored
 * sessions pass correctly after a page reload. The app area additionally
 * requires a verified e-mail address (the shared guest account is exempt)
 * AND a fresh verified-e-mail claim on the cached ID token — the Firestore
 * rules check the token claim, which can lag behind the account state on a
 * restored session (e.g. the continueUrl tab of the verification mail).
 * Unverified accounts and accounts whose stale claim cannot be refreshed
 * are routed to the verification screen instead of loading a broken app.
 */
import { inject } from '@angular/core';
import { Auth, User, authState } from '@angular/fire/auth';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { firstValueFrom, map, take } from 'rxjs';

import {
  AccountSecurityService,
  isVerifiedOrGuest,
} from '../services/account-security.service';

/**
 * Allows the app area only for signed-in, verified-or-guest users whose ID
 * token provably carries the verified claim; signed-out users go to login,
 * unverified ones (or ones whose stale claim failed to refresh, e.g.
 * offline) to the verification screen. A user still flagged unverified is
 * reloaded once first — the persisted flag can lag behind an external
 * verification (mail-link tab, second device) — and every check is awaited
 * before activation, so no Firestore stream can ever start on a stale
 * claim.
 */
export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const accountSecurity = inject(AccountSecurityService);
  const currentUser = await firstValueFrom(authState(inject(Auth)));
  if (currentUser) await accountSecurity.refreshStaleVerification(currentUser);
  const target = appAreaTarget(currentUser, router);
  if (target !== true || !currentUser) return target;
  const hasFreshClaim = await accountSecurity.ensureVerifiedTokenClaim(currentUser);
  return hasFreshClaim ? true : router.createUrlTree(['/auth/verify-email']);
};

/**
 * Redirects already signed-in users from auth entry pages to the app
 * (the app guard forwards unverified accounts on to the verification screen).
 */
export const unauthGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  return authState(auth).pipe(
    take(1),
    map(currentUser => (currentUser ? router.createUrlTree(['/app']) : true)),
  );
};

/**
 * Allows the verification screen only while it applies: signed-out users go
 * to login, verified (or guest) accounts with a fresh token claim into the
 * app. A verified account whose stale claim cannot be refreshed stays here
 * — never bouncing back to the app guard, which would redirect-loop — and
 * uses the screen's confirm action to retry the refresh.
 */
export const verifyEmailGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const accountSecurity = inject(AccountSecurityService);
  const currentUser = await firstValueFrom(authState(inject(Auth)));
  if (!currentUser) return router.createUrlTree(['/auth/login']);
  if (!isVerifiedOrGuest(currentUser)) return true;
  const hasFreshClaim = await accountSecurity.ensureVerifiedTokenClaim(currentUser);
  return hasFreshClaim ? router.createUrlTree(['/app']) : true;
};


/**
 * Resolves the app-area guard result for the first emitted auth state.
 * @param currentUser Restored Firebase user, or null while signed out.
 * @param router Router used to build redirect trees.
 */
function appAreaTarget(currentUser: User | null, router: Router): true | UrlTree {
  if (!currentUser) return router.createUrlTree(['/auth/login']);
  if (!isVerifiedOrGuest(currentUser)) return router.createUrlTree(['/auth/verify-email']);
  return true;
}
