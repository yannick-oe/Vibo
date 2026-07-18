/**
 * @file Channel invite links: create, list, resolve and revoke invites plus
 * the deployment-aware share URL. The Firestore auto-id of invites/{token}
 * IS the unguessable token — possessing the link is the access proof; the
 * membership write on accept rides the existing join-yourself rule, since
 * channels are already open-join via join-on-send (the token is UX, not a
 * security boundary). Expiry is computed client-side on create, enforced by
 * the rules (expiresAt > request.time) and filtered client-side on read.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from '@angular/fire/firestore';

import { Invite, InviteDoc } from '../models/invite.model';
import { buildInviteUrl } from '../shared/invite.constants';
import { AuthService } from './auth.service';

const INVITES_COLLECTION = 'invites';
export const INVITE_TTL_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * Data access for invites/{token}. Reads are one-shot (invites are a
 * management surface, not a live view) so the feature adds no listener.
 */
@Injectable({ providedIn: 'root' })
export class InviteService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly injector = inject(EnvironmentInjector);


  /**
   * Creates an invite for a channel, expiring after the fixed TTL.
   * @param channelId Channel the invite joins.
   * @returns The new invite's token (the document id).
   */
  async createInvite(channelId: string): Promise<string> {
    const invite: InviteDoc = {
      channelId,
      createdBy: this.authService.requireUid(),
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + INVITE_TTL_DAYS * DAY_MS),
    };
    const reference = await this.inContext(() =>
      addDoc(collection(this.firestore, INVITES_COLLECTION), invite),
    );
    return reference.id;
  }


  /**
   * Reads all unexpired invites of a channel once, newest first.
   * @param channelId Channel whose invites to list.
   */
  async activeInvites(channelId: string): Promise<Invite[]> {
    const invitesQuery = this.inContext(() =>
      query(collection(this.firestore, INVITES_COLLECTION), where('channelId', '==', channelId)),
    );
    const snapshot = await this.inContext(() => getDocs(invitesQuery));
    return snapshot.docs
      .map(document => ({ ...(document.data() as InviteDoc), token: document.id }))
      .filter(isUnexpired)
      .sort(byNewestFirst);
  }


  /**
   * Resolves a token to its invite; null when missing, revoked or expired.
   * @param token Invite token from the share URL.
   */
  async resolveInvite(token: string): Promise<Invite | null> {
    const reference = this.inContext(() => doc(this.firestore, `${INVITES_COLLECTION}/${token}`));
    const snapshot = await this.inContext(() => getDoc(reference));
    if (!snapshot.exists()) return null;
    const invite: Invite = { ...(snapshot.data() as InviteDoc), token };
    return isUnexpired(invite) ? invite : null;
  }


  /**
   * Revokes an invite by deleting its document (creator only per rules).
   * @param token Token of the invite to revoke.
   */
  revokeInvite(token: string): Promise<void> {
    return this.inContext(() =>
      deleteDoc(doc(this.firestore, `${INVITES_COLLECTION}/${token}`)),
    );
  }


  /**
   * Builds the shareable URL of a token against the deployed app base, so
   * the link is correct on both the root and the subfolder deployment.
   * @param token Invite token.
   */
  inviteUrl(token: string): string {
    return buildInviteUrl(token);
  }


  /**
   * Runs a Firebase API call in the injection context as AngularFire requires.
   * @param operation Firebase call to execute.
   */
  private inContext<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}


/**
 * Whether the invite's expiry is still in the future.
 * @param invite Invite read from Firestore.
 */
function isUnexpired(invite: Invite): boolean {
  return invite.expiresAt instanceof Timestamp && invite.expiresAt.toMillis() > Date.now();
}


/**
 * Sorts invites by creation time, newest first; pending server timestamps
 * (own just-created invite) sort to the top.
 * @param a First invite.
 * @param b Second invite.
 */
function byNewestFirst(a: Invite, b: Invite): number {
  return createdMillis(b) - createdMillis(a);
}


/**
 * Resolves an invite's creation time in milliseconds; a still-pending
 * server timestamp resolves to now so it sorts newest.
 * @param invite Invite read from Firestore.
 */
function createdMillis(invite: Invite): number {
  return invite.createdAt instanceof Timestamp ? invite.createdAt.toMillis() : Date.now();
}
