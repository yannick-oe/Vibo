/**
 * @file Application-wide provider configuration, including router, Firebase
 * and the German locale used for all date formatting.
 */
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  ViewTransitionInfo,
  provideRouter,
  withComponentInputBinding,
  withHashLocation,
  withViewTransitions,
} from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';

import { environment } from '../environments/environment';
import { routes } from './app.routes';

registerLocaleData(localeDe);

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Skips the route cross-fade for users who prefer reduced motion, leaving the
 * instant DOM swap in place. Browsers without the View Transitions API never
 * reach this — withViewTransitions feature-detects document.startViewTransition.
 * @param info View transition info supplied by the router.
 */
function skipReducedMotionTransition(info: ViewTransitionInfo): void {
  if (window.matchMedia(REDUCED_MOTION_QUERY).matches) info.transition.skipTransition();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withHashLocation(),
      withViewTransitions({ onViewTransitionCreated: skipReducedMotionTransition }),
    ),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    { provide: LOCALE_ID, useValue: 'de' },
  ],
};
