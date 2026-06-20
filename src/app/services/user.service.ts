/**
 * @file Live stream of all user documents from the Firestore users collection.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  orderBy,
  query,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable, catchError, of, switchMap } from 'rxjs';

import { UserDoc } from '../models/user.model';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

const USERS_LOAD_ERROR = 'Benutzer konnten nicht geladen werden.';

/**
 * Streams all user documents while someone is signed in. Drives the
 * direct-message list and the member picker of the channel-creation flow.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly toastService = inject(ToastService);

  private readonly injector = inject(EnvironmentInjector);

  readonly users = toSignal(this.streamUsers(), { initialValue: [] as UserDoc[] });


  /**
   * Updates the signed-in user's profile; the change propagates to every
   * surface live because all rendering resolves users via the stream.
   * @param name Trimmed new display name.
   * @param avatarPath Public asset path of the selected avatar.
   * @param banner Selected profile-banner id (see BANNER_OPTIONS).
   */
  updateProfile(name: string, avatarPath: string, banner: string): Promise<void> {
    const uid = this.authService.requireUid();
    return runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `users/${uid}`), { name: name.trim(), avatarPath, banner }),
    );
  }


  /**
   * Streams the users collection ordered by name; emits an empty list while
   * signed out so the subscription never reads without permission. The query
   * is created in the injection context as required by AngularFire.
   */
  private streamUsers(): Observable<UserDoc[]> {
    return toObservable(this.authService.currentUser).pipe(
      switchMap(current =>
        current ? runInInjectionContext(this.injector, () => this.queryUsers()) : of([]),
      ),
    );
  }


  /**
   * Reads the users collection live; on Firestore errors a toast is shown
   * and an empty list keeps the UI functional.
   */
  private queryUsers(): Observable<UserDoc[]> {
    const usersQuery = query(collection(this.firestore, 'users'), orderBy('name'));
    return (collectionData(usersQuery) as Observable<UserDoc[]>).pipe(
      catchError(() => this.reportLoadError()),
    );
  }


  /**
   * Shows the load-error toast and recovers with an empty list.
   */
  private reportLoadError(): Observable<UserDoc[]> {
    this.toastService.show(USERS_LOAD_ERROR);
    return of([]);
  }
}
