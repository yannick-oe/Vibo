/**
 * @file Application-wide provider configuration, including router, Firebase
 * with persistent offline cache, the production service worker and the
 * German locale used for all date formatting.
 */
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  ViewTransitionInfo,
  provideRouter,
  withComponentInputBinding,
  withHashLocation,
  withViewTransitions,
} from '@angular/router';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  provideFirestore,
} from '@angular/fire/firestore';
import { provideServiceWorker } from '@angular/service-worker';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { AppUpdateService } from './services/app-update.service';

registerLocaleData(localeDe);

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const SW_REGISTRATION_STRATEGY = 'registerWhenStable:30000';

/**
 * Skips the route cross-fade for users who prefer reduced motion, leaving the
 * instant DOM swap in place. Browsers without the View Transitions API never
 * reach this — withViewTransitions feature-detects document.startViewTransition.
 * @param info View transition info supplied by the router.
 */
function skipReducedMotionTransition(info: ViewTransitionInfo): void {
  if (window.matchMedia(REDUCED_MOTION_QUERY).matches) info.transition.skipTransition();
}


/**
 * Creates the Firestore instance with a persistent local cache shared across
 * tabs, so previously loaded data survives reloads and renders offline. When
 * persistence cannot initialize (storage-restricted private mode, unsupported
 * browser), this falls back to the default in-memory instance — the app then
 * simply behaves as before, online-only, with no user-facing error.
 */
function createFirestoreWithOfflineCache(): Firestore {
  try {
    return initializeFirestore(getApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore();
  }
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
    provideFirestore(createFirestoreWithOfflineCache),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: SW_REGISTRATION_STRATEGY,
    }),
    provideAppInitializer(() => inject(AppUpdateService).init()),
    { provide: LOCALE_ID, useValue: 'de' },
  ],
};
