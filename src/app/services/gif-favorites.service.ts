/**
 * @file Per-user GIF favorites stored as ONE document at
 * userGifFavorites/{uid}: the whole list rides in a single array field,
 * newest first, capped at MAX_GIF_FAVORITES (adding beyond the cap drops
 * the oldest). The document is read one-shot when the picker first needs
 * it (session-cached per uid; §14: no listener) and every toggle rewrites
 * the full document. The shared guest account is excluded client-side
 * (star and tile hidden) AND server-side (rules deny its writes).
 */
import { EnvironmentInjector, Injectable, computed, inject, runInInjectionContext, signal } from '@angular/core';
import { Firestore, doc, getDoc, serverTimestamp, setDoc } from '@angular/fire/firestore';

import { GifFavorite, GifFavoritesDoc, GifResult } from '../models/gif.model';
import { AuthService } from './auth.service';

/** Firestore collection holding the per-user favorites documents. */
export const USER_GIF_FAVORITES_COLLECTION = 'userGifFavorites';

/** Maximum stored favorites per user (mirrored in firestore.rules). */
export const MAX_GIF_FAVORITES = 50;

/**
 * Loads, caches and toggles the signed-in user's GIF favorites. All
 * Firestore access is one-shot; nothing here ever subscribes a listener.
 */
@Injectable({ providedIn: 'root' })
export class GifFavoritesService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly injector = inject(EnvironmentInjector);

  private readonly favoritesState = signal<readonly GifFavorite[]>([]);

  /** Cached favorites of the signed-in user, newest first. */
  readonly favorites = this.favoritesState.asReadonly();

  private readonly favoriteIds = computed(() => new Set(this.favoritesState().map(entry => entry.id)));

  private loadedUid: string | null = null;


  /**
   * Loads the favorites document once per session and uid (the picker
   * calls this on open); guests and repeat calls resolve immediately, a
   * failed fetch stays retryable on the next open.
   */
  async ensureLoaded(): Promise<void> {
    const uid = this.authService.currentUser()?.uid;
    if (!uid || this.authService.isGuest() || this.loadedUid === uid) return;
    try {
      const snapshot = await runInInjectionContext(this.injector, () =>
        getDoc(doc(this.firestore, USER_GIF_FAVORITES_COLLECTION, uid)),
      );
      this.favoritesState.set((snapshot.data() as GifFavoritesDoc | undefined)?.gifs ?? []);
      this.loadedUid = uid;
    } catch {
      return;
    }
  }


  /**
   * Reports whether a GIF is currently favorited.
   * @param gifId Giphy media id.
   */
  isFavorite(gifId: string): boolean {
    return this.favoriteIds().has(gifId);
  }


  /**
   * Adds or removes a favorite and persists the whole document; adding
   * beyond the cap drops the oldest entry. Failures roll the cached list
   * back so UI state never diverges from storage.
   * @param gif GIF whose favorite state is toggled.
   */
  async toggle(gif: GifResult): Promise<void> {
    const uid = this.authService.currentUser()?.uid;
    if (!uid || this.authService.isGuest()) return;
    const previous = this.favoritesState();
    const next = this.isFavorite(gif.id)
      ? previous.filter(entry => entry.id !== gif.id)
      : [toFavorite(gif), ...previous].slice(0, MAX_GIF_FAVORITES);
    this.favoritesState.set(next);
    await this.persist(uid, next).catch(() => this.favoritesState.set(previous));
  }


  /**
   * Writes the full favorites document (merge write, one per toggle).
   * @param uid Owner of the document.
   * @param gifs Complete next favorites list.
   */
  private persist(uid: string, gifs: readonly GifFavorite[]): Promise<void> {
    const document: GifFavoritesDoc = { gifs, updatedAt: serverTimestamp() };
    return runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, USER_GIF_FAVORITES_COLLECTION, uid), document, { merge: true }),
    );
  }
}


/**
 * Maps a picked GIF result to its stored favorite entry.
 * @param gif GIF being favorited.
 */
function toFavorite(gif: GifResult): GifFavorite {
  return {
    id: gif.id,
    title: gif.alt,
    previewUrl: gif.preview,
    url: gif.url,
    width: gif.width,
    height: gif.height,
    addedAt: Date.now(),
  };
}
