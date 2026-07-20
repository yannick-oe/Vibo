/**
 * @file Live stream of all user documents from the Firestore users collection.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  orderBy,
  query,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { UserDoc } from '../models/user.model';
import { isVerifiedOrGuest } from './account-security.service';
import { AuthDiagnosticsService } from './auth-diagnostics.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { tokenGatedStream } from './token-gated-stream';

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

  private readonly diagnostics = inject(AuthDiagnosticsService);

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
   * error. Self-healing (see token-gated-stream.ts): an inner error shows
   * the load toast once, degrades to the empty list and re-subscribes on
   * the next ID-token emission instead of staying dark for the session.
   * The query is created in the injection context as AngularFire requires.
   */
  private streamUsers(): Observable<UserDoc[]> {
    return tokenGatedStream({
      label: 'users',
      source: this.authService.tokenChanges,
      gate: current => (isVerifiedOrGuest(current) ? current.uid : null),
      empty: [] as UserDoc[],
      build: () => runInInjectionContext(this.injector, () => this.queryUsers()),
      diagnostics: this.diagnostics,
      onError: () => this.toastService.show(USERS_LOAD_ERROR),
    });
  }


  /**
   * Reads the users collection live; error recovery is attached by the
   * surrounding token-gated stream.
   */
  private queryUsers(): Observable<UserDoc[]> {
    const usersQuery = query(collection(this.firestore, 'users'), orderBy('name'));
    return collectionData(usersQuery) as Observable<UserDoc[]>;
  }
}
