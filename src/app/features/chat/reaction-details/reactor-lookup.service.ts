/**
 * @file Resolves reacting uids to display profiles: the live user stream is
 * consulted first, uids missing from it (deleted accounts) are fetched once
 * via getDoc and cached — including negative results — so hovering never
 * causes fetch storms and never adds a Firestore listener.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext, signal } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

import { UserDoc } from '../../../models/user.model';
import { UserService } from '../../../services/user.service';

/** Minimal display profile of a reactor. */
export interface ReactorProfile {
  /** Display name of the user. */
  readonly name: string;
  /** Stored local avatar asset path, or null when unknown. */
  readonly avatarPath: string | null;
}

/**
 * Uid-to-profile lookup for the reaction-details tooltip. Reading is fully
 * reactive (user stream plus the one-shot fallback cache are both signals);
 * fetching happens lazily per uid on first request.
 */
@Injectable({ providedIn: 'root' })
export class ReactorLookupService {
  private readonly firestore = inject(Firestore);

  private readonly userService = inject(UserService);

  private readonly injector = inject(EnvironmentInjector);

  private readonly fetched = signal<ReadonlyMap<string, ReactorProfile | null>>(new Map());

  private readonly pendingUids = new Set<string>();


  /**
   * Resolves a uid to its display profile from the live user stream or the
   * one-shot fallback cache; null while unresolved or for deleted accounts.
   * @param uid Uid of the reacting user.
   */
  profileFor(uid: string): ReactorProfile | null {
    const streamed = this.userService.users().find(user => user.uid === uid);
    if (streamed) return { name: streamed.name, avatarPath: streamed.avatarPath };
    return this.fetched().get(uid) ?? null;
  }


  /**
   * Fetches one-shot profiles for the uids that neither the user stream nor
   * the fallback cache know; already-pending uids are never re-fetched.
   * @param uids Visible (capped) reactor uids to resolve.
   */
  ensureLoaded(uids: readonly string[]): void {
    const users = this.userService.users();
    for (const uid of uids) {
      const known =
        users.some(user => user.uid === uid) || this.fetched().has(uid) || this.pendingUids.has(uid);
      if (!known) void this.fetchProfile(uid);
    }
  }


  /**
   * Reads a single user document once and caches the result; read failures
   * and missing documents are cached as null so they resolve to "Unbekannt"
   * without being retried on every hover.
   * @param uid Uid whose document is fetched.
   */
  private async fetchProfile(uid: string): Promise<void> {
    this.pendingUids.add(uid);
    const snapshot = await runInInjectionContext(this.injector, () =>
      getDoc(doc(this.firestore, `users/${uid}`)),
    ).catch(() => null);
    const data = snapshot?.data() as UserDoc | undefined;
    this.storeProfile(uid, data ? { name: data.name, avatarPath: data.avatarPath } : null);
  }


  /**
   * Writes a fetch result into the fallback cache and clears the in-flight
   * marker; the new map identity notifies every reading computed.
   * @param uid Uid the result belongs to.
   * @param profile Resolved profile, or null for missing documents.
   */
  private storeProfile(uid: string, profile: ReactorProfile | null): void {
    this.pendingUids.delete(uid);
    const next = new Map(this.fetched());
    next.set(uid, profile);
    this.fetched.set(next);
  }
}
