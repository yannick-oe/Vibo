/**
 * @file Vanity invite slugs (inviteSlugs/{slug}): claim, removal, one-shot
 * resolution and the share URL. Claiming follows the username reservation
 * pattern — the slug document is created in the same batch that stamps the
 * slug onto the channel, and because slug documents are never updatable
 * (rules), a taken slug fails that create atomically: the collision IS the
 * availability check, so typing costs zero reads. All reads are one-shot;
 * the feature adds no listener.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  DocumentReference,
  Firestore,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from '@angular/fire/firestore';

import { Channel } from '../models/channel.model';
import { InviteSlugDoc } from '../models/invite.model';
import {
  INVITE_SLUGS_COLLECTION,
  INVITE_SLUG_REGEX,
  buildInviteUrl,
} from '../shared/invite.constants';
import { AuthService } from './auth.service';

/**
 * Data access for the inviteSlugs/{slug} registry backing the
 * human-readable invite links (creator-only management per rules).
 */
@Injectable({ providedIn: 'root' })
export class InviteSlugService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly injector = inject(EnvironmentInjector);


  /**
   * Claims a slug for a channel in one atomic batch: creates the slug doc
   * (a taken slug rejects the whole batch — the availability check),
   * stamps the slug onto the channel and releases the channel's previous
   * slug if one existed.
   * @param channel Channel of the signed-in creator.
   * @param slug Pre-validated slug to claim.
   */
  claimSlug(channel: Channel, slug: string): Promise<void> {
    return this.inContext(() => {
      const batch = writeBatch(this.firestore);
      batch.set(this.slugRef(slug), this.buildSlugDoc(channel.id));
      batch.update(doc(this.firestore, `channels/${channel.id}`), { inviteSlug: slug });
      const previous = channel.inviteSlug;
      if (previous && previous !== slug) batch.delete(this.slugRef(previous));
      return batch.commit();
    });
  }


  /**
   * Removes a channel's slug in one atomic batch: clears the channel field
   * and deletes the slug document, freeing the name.
   * @param channel Channel whose slug to release.
   */
  removeSlug(channel: Channel): Promise<void> {
    const slug = channel.inviteSlug;
    if (!slug) return Promise.resolve();
    return this.inContext(() => {
      const batch = writeBatch(this.firestore);
      batch.update(doc(this.firestore, `channels/${channel.id}`), { inviteSlug: deleteField() });
      batch.delete(this.slugRef(slug));
      return batch.commit();
    });
  }


  /**
   * Resolves a slug to its channel id with a single one-shot read; null
   * when the parameter is not slug-shaped or no claim exists. Callers
   * resolve tokens FIRST — a slug must never shadow a token.
   * @param slug Candidate slug from the redeem route.
   */
  async resolveSlug(slug: string): Promise<string | null> {
    if (!INVITE_SLUG_REGEX.test(slug)) return null;
    const snapshot = await this.inContext(() => getDoc(this.slugRef(slug)));
    if (!snapshot.exists()) return null;
    return (snapshot.data() as InviteSlugDoc).channelId;
  }


  /**
   * Builds the shareable URL of a slug against the deployed app base.
   * @param slug Claimed vanity slug.
   */
  slugUrl(slug: string): string {
    return buildInviteUrl(slug);
  }


  /**
   * Builds the reservation document of a slug claim.
   * @param channelId Channel the slug link joins.
   */
  private buildSlugDoc(channelId: string): InviteSlugDoc {
    return {
      channelId,
      createdBy: this.authService.requireUid(),
      createdAt: serverTimestamp(),
    };
  }


  /**
   * Builds the registry document reference of a slug.
   * @param slug Slug (doc id in the registry).
   */
  private slugRef(slug: string): DocumentReference {
    return this.inContext(() => doc(this.firestore, `${INVITE_SLUGS_COLLECTION}/${slug}`));
  }


  /**
   * Runs a Firebase API call in the injection context as AngularFire requires.
   * @param operation Firebase call to execute.
   */
  private inContext<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
