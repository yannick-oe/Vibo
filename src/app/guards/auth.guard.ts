/**
 * @file Route guards separating authenticated and unauthenticated areas.
 * All guards wait for the first Firebase auth-state emission so restored
 * sessions pass correctly after a page reload. The app area additionally
 * requires a verified e-mail address (the shared guest account is exempt);
 * unverified accounts are routed to the verification screen instead.
 */
import { inject } from '@angular/core';
import { Auth, User, authState } from '@angular/fire/auth';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, take } from 'rxjs';

import { isVerifiedOrGuest } from '../services/account-security.service';

/**
 * Allows the app area only for signed-in, verified-or-guest users;
 * signed-out users go to login, unverified ones to the verification screen.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  return authState(auth).pipe(take(1), map(currentUser => appAreaTarget(currentUser, router)));
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
 * Allows the verification screen only while it applies: signed-out users
 * go to login, already verified (or guest) accounts into the app.
 */
export const verifyEmailGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  return authState(auth).pipe(take(1), map(currentUser => verifyScreenTarget(currentUser, router)));
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


/**
 * Resolves the verification-screen guard result for the first emitted
 * auth state.
 * @param currentUser Restored Firebase user, or null while signed out.
 * @param router Router used to build redirect trees.
 */
function verifyScreenTarget(currentUser: User | null, router: Router): true | UrlTree {
  if (!currentUser) return router.createUrlTree(['/auth/login']);
  if (isVerifiedOrGuest(currentUser)) return router.createUrlTree(['/app']);
  return true;
}
