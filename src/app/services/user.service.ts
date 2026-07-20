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
import { isVerifiedOrGuest } from './account-security.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

const USERS_LOAD_ERROR = 'Benutzer konnten nicht geladen werden.';

/** Edited profile values written by the profile dialog's save action. */
export interface ProfileDraft {
  readonly name: string;
  readonly avatarPath: string;
  readonly banner: string;
  readonly status: string;
  readonly animatedName: boolean;
}

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
   * surface live because all rendering resolves users via the stream. Name and
   * status are trimmed.
   * @param draft Edited profile values.
   */
  updateProfile(draft: ProfileDraft): Promise<void> {
    const uid = this.authService.requireUid();
    return runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, `users/${uid}`), {
        name: draft.name.trim(),
        avatarPath: draft.avatarPath,
        banner: draft.banner,
        status: draft.status.trim(),
        animatedName: draft.animatedName,
      }),
    );
  }


  /**
   * Streams the users collection ordered by name; emits an empty list while
   * signed out or unverified, mirroring the security rules — the list query
   * has no signup-time carve-out, so starting it for the freshly created,
   * still-unverified account mid-registration would only raise the load
   * error. The source re-emits on token refresh (idToken-based), so the
   * query starts right after the verified claim is proven. The query is
   * created in the injection context as required by AngularFire.
   */
  private streamUsers(): Observable<UserDoc[]> {
    return toObservable(this.authService.currentUser).pipe(
      switchMap(current =>
        current && isVerifiedOrGuest(current)
          ? runInInjectionContext(this.injector, () => this.queryUsers())
          : of([]),
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
