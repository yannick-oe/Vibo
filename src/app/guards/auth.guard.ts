/**
 * @file Route guards separating authenticated and unauthenticated areas.
 * Both wait for the first Firebase auth-state emission so restored sessions
 * pass correctly after a page reload.
 */
import { inject } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';

/**
 * Allows the app area only for signed-in users; otherwise redirects to login.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  return authState(auth).pipe(
    take(1),
    map(currentUser => (currentUser ? true : router.createUrlTree(['/auth/login']))),
  );
};

/**
 * Redirects already signed-in users from auth entry pages to the app.
 */
export const unauthGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  return authState(auth).pipe(
    take(1),
    map(currentUser => (currentUser ? router.createUrlTree(['/app']) : true)),
  );
};
