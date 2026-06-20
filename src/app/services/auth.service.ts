/**
 * @file Authentication service wrapping Firebase Auth and the user document.
 * All Firebase calls run in the injection context as required by AngularFire,
 * because service methods are invoked from component event handlers.
 */
import {
  EnvironmentInjector,
  Injectable,
  computed,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Auth,
  GoogleAuthProvider,
  User,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  user,
  verifyPasswordResetCode,
} from '@angular/fire/auth';
import {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';

import { UserDoc } from '../models/user.model';
import { BANNER_NONE } from '../shared/banner-options';
import {
  DEFAULT_AVATAR_PATH,
  REMOTE_AVATAR_PREFIX,
  RegistrationFormData,
} from './registration.service';

const GUEST_NAME = 'Gast';
const GUEST_EMAIL = 'gast@dabubble.dev';
const GUEST_PASSWORD = 'DABubble-Gast-2026!';
const GUEST_BANNER = 'nebula';
const GUEST_STATUS = 'Nur zu Besuch im Kosmos ✨';
const NOT_SIGNED_IN_ERROR = 'Operation requires a signed-in user.';

/**
 * Handles authentication against Firebase Auth and keeps the related
 * Firestore user document in sync.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);

  private readonly firestore = inject(Firestore);

  private readonly injector = inject(EnvironmentInjector);

  readonly currentUser = toSignal(user(this.auth), { initialValue: null });

  /** True while the signed-in user is the fixed shared guest account. */
  readonly isGuest = computed(() => this.currentUser()?.email === GUEST_EMAIL);


  /**
   * Returns the signed-in user's uid or fails fast when called signed out.
   */
  requireUid(): string {
    const uid = this.currentUser()?.uid;
    if (!uid) throw new Error(NOT_SIGNED_IN_ERROR);
    return uid;
  }


  /**
   * Creates the Firebase account, sets display name and avatar on the auth
   * profile and stores the user document in Firestore.
   * @param data Validated registration form values.
   * @param avatarPath Public asset path of the selected avatar.
   * @returns Uid of the newly created user.
   */
  async register(data: RegistrationFormData, avatarPath: string): Promise<string> {
    const credential = await this.inContext(() =>
      createUserWithEmailAndPassword(this.auth, data.email, data.password),
    );
    await this.inContext(() =>
      updateProfile(credential.user, { displayName: data.name, photoURL: avatarPath }),
    );
    await this.createUserDocument(credential.user.uid, data, avatarPath);
    return credential.user.uid;
  }


  /**
   * Signs in with e-mail and password.
   * @param email Account e-mail address.
   * @param password Account password.
   */
  async signIn(email: string, password: string): Promise<void> {
    await this.inContext(() => signInWithEmailAndPassword(this.auth, email, password));
  }


  /**
   * Signs in via Google popup and creates the user document on first login.
   */
  async signInWithGoogle(): Promise<void> {
    const credential = await this.inContext(() =>
      signInWithPopup(this.auth, new GoogleAuthProvider()),
    );
    await this.ensureUserDocument(credential.user);
  }


  /**
   * Signs in to the fixed shared guest account and resets its profile so
   * changes from a previous guest session do not leak into the next one.
   * The credentials are deliberately client-visible (see CLAUDE.md tech
   * debt): the account has no privileges beyond a normal user.
   */
  async signInAsGuest(): Promise<void> {
    const credential = await this.inContext(() =>
      signInWithEmailAndPassword(this.auth, GUEST_EMAIL, GUEST_PASSWORD),
    );
    await this.resetGuestDocument(credential.user.uid);
  }


  /**
   * Signs the current user out.
   */
  logout(): Promise<void> {
    return this.inContext(() => signOut(this.auth));
  }


  /**
   * Sends the password-reset e-mail. The continue link points at the app base
   * (`document.baseURI`) so it stays valid under the subfolder/hash deployment
   * and its authorized domain, instead of a hardcoded path that can be rejected.
   * @param email Address entered on the forgot-password screen.
   */
  sendPasswordReset(email: string): Promise<void> {
    const settings = { url: document.baseURI };
    return this.inContext(() => sendPasswordResetEmail(this.auth, email, settings));
  }


  /**
   * Verifies a password-reset action code from the e-mail link.
   * @param code Firebase oobCode query parameter.
   * @returns The e-mail address belonging to the code.
   */
  verifyResetCode(code: string): Promise<string> {
    return this.inContext(() => verifyPasswordResetCode(this.auth, code));
  }


  /**
   * Sets the new password for a verified reset code.
   * @param code Firebase oobCode query parameter.
   * @param newPassword Password chosen on the reset screen.
   */
  completePasswordReset(code: string, newPassword: string): Promise<void> {
    return this.inContext(() => confirmPasswordReset(this.auth, code, newPassword));
  }


  /**
   * Runs a Firebase API call in the injection context; required because
   * AngularFire warns about calls scheduled from event handlers.
   * @param operation Firebase call to execute.
   */
  private inContext<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }


  /**
   * Overwrites the guest user document with the default profile. The doc
   * e-mail stays null so the technical account address is never shown.
   * @param uid Uid of the fixed guest account.
   */
  private resetGuestDocument(uid: string): Promise<void> {
    const document: UserDoc = {
      uid,
      name: GUEST_NAME,
      email: null,
      avatarPath: DEFAULT_AVATAR_PATH,
      banner: GUEST_BANNER,
      status: GUEST_STATUS,
      animatedName: true,
      createdAt: serverTimestamp(),
    };
    return this.inContext(() => setDoc(doc(this.firestore, `users/${uid}`), document));
  }


  /**
   * Writes the Firestore document for a newly registered user.
   * @param uid Firebase Auth user id.
   * @param data Validated registration form values.
   * @param avatarPath Public asset path of the selected avatar.
   */
  private createUserDocument(
    uid: string,
    data: RegistrationFormData,
    avatarPath: string,
  ): Promise<void> {
    const document: UserDoc = {
      uid,
      name: data.name,
      email: data.email,
      avatarPath,
      banner: BANNER_NONE,
      status: '',
      animatedName: false,
      createdAt: serverTimestamp(),
    };
    return this.inContext(() => setDoc(doc(this.firestore, `users/${uid}`), document));
  }


  /**
   * Creates the user document for popup sign-ins if it is missing,
   * otherwise repairs legacy documents with external avatar URLs.
   * @param firebaseUser Authenticated Firebase user.
   */
  private async ensureUserDocument(firebaseUser: User): Promise<void> {
    const reference = this.inContext(() =>
      doc(this.firestore, `users/${firebaseUser.uid}`),
    );
    const snapshot = await this.inContext(() => getDoc(reference));
    if (!snapshot.exists()) {
      await this.inContext(() => setDoc(reference, this.buildUserDoc(firebaseUser)));
      return;
    }
    await this.normalizeAvatarPath(reference, snapshot);
  }


  /**
   * One-time repair: replaces an external avatar URL in a loaded user
   * document with the local placeholder path.
   * @param reference Document reference of the loaded user.
   * @param snapshot Loaded document snapshot.
   */
  private async normalizeAvatarPath(
    reference: DocumentReference,
    snapshot: DocumentSnapshot,
  ): Promise<void> {
    const avatarPath = (snapshot.data() as UserDoc | undefined)?.avatarPath ?? '';
    if (!avatarPath.startsWith(REMOTE_AVATAR_PREFIX)) return;
    await this.inContext(() => updateDoc(reference, { avatarPath: DEFAULT_AVATAR_PATH }));
  }


  /**
   * Maps a Firebase user to the Firestore document shape. The avatar is
   * always the local placeholder; external photo URLs are ignored.
   * @param firebaseUser Authenticated Firebase user.
   */
  private buildUserDoc(firebaseUser: User): UserDoc {
    return {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName ?? GUEST_NAME,
      email: firebaseUser.email,
      avatarPath: DEFAULT_AVATAR_PATH,
      banner: BANNER_NONE,
      status: '',
      animatedName: false,
      createdAt: serverTimestamp(),
    };
  }
}
