/**
 * @file Route guard preventing deep links into the avatar step without form data.
 */
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { RegistrationService } from '../services/registration.service';

/**
 * Allows the avatar step only when the registration form was completed;
 * otherwise redirects to the form step.
 */
export const registrationFormGuard: CanActivateFn = () => {
  const registration = inject(RegistrationService);
  const router = inject(Router);
  return registration.hasFormData() ? true : router.createUrlTree(['/auth/register']);
};
