/**
 * @file Client-side deep deletion of a channel whose last member leaves:
 * Firestore does not cascade subcollection deletes, so every reply,
 * message and finally the channel document is collected and removed in
 * chunked batches (a crash mid-delete can orphan documents — accepted at
 * project scale, see CLAUDE.md). A vanity invite slug is released in the
 * same sweep, but only when the leaver is the channel creator — slug
 * deletes are creator-only per rules, and a denied delete would abort its
 * whole batch. A slug orphaned by a foreign teardown resolves to the
 * missing channel and shows the invalid-invite state.
 */
import {
  DocumentReference,
  Firestore,
  collection,
  doc,
  getDocs,
  writeBatch,
} from '@angular/fire/firestore';

import { Channel } from '../models/channel.model';
import { INVITE_SLUGS_COLLECTION } from '../shared/invite.constants';

const DELETE_BATCH_LIMIT = 450;

/** Runs a Firebase API call in the caller's injection context. */
export type FirestoreContextRunner = <T>(operation: () => T) => T;


/**
 * Deletes a channel with all message and reply documents plus the
 * creator-owned vanity slug reservation, in chunked batches.
 * @param firestore Firestore instance of the calling service.
 * @param run Injection-context wrapper of the calling service.
 * @param channel Channel to tear down.
 * @param uid Uid of the leaving (last) member.
 */
export async function deleteChannelDeep(
  firestore: Firestore,
  run: FirestoreContextRunner,
  channel: Channel,
  uid: string,
): Promise<void> {
  const references = await collectChannelDocRefs(firestore, run, channel.id);
  references.push(...slugCleanupRefs(firestore, channel, uid));
  await commitDeletes(firestore, run, references);
}


/**
 * Collects the references of all reply, message and channel documents.
 * @param firestore Firestore instance of the calling service.
 * @param run Injection-context wrapper of the calling service.
 * @param channelId Firestore id of the channel.
 */
async function collectChannelDocRefs(
  firestore: Firestore,
  run: FirestoreContextRunner,
  channelId: string,
): Promise<DocumentReference[]> {
  const references: DocumentReference[] = [];
  const messages = await run(() => getDocs(collection(firestore, `channels/${channelId}/messages`)));
  for (const message of messages.docs) {
    const replies = await run(() => getDocs(collection(message.ref, 'replies')));
    references.push(...replies.docs.map(reply => reply.ref), message.ref);
  }
  references.push(doc(firestore, `channels/${channelId}`));
  return references;
}


/**
 * The slug-reservation reference to delete alongside the channel; empty
 * unless the channel carries a slug AND the leaver is its creator (the
 * only uid the rules allow to delete it).
 * @param firestore Firestore instance of the calling service.
 * @param channel Channel being torn down.
 * @param uid Uid of the leaving member.
 */
function slugCleanupRefs(firestore: Firestore, channel: Channel, uid: string): DocumentReference[] {
  if (!channel.inviteSlug || channel.createdBy !== uid) return [];
  return [doc(firestore, `${INVITE_SLUGS_COLLECTION}/${channel.inviteSlug}`)];
}


/**
 * Deletes the given documents in batches below the Firestore batch limit.
 * @param firestore Firestore instance of the calling service.
 * @param run Injection-context wrapper of the calling service.
 * @param references Document references to delete, children first.
 */
async function commitDeletes(
  firestore: Firestore,
  run: FirestoreContextRunner,
  references: DocumentReference[],
): Promise<void> {
  for (let start = 0; start < references.length; start += DELETE_BATCH_LIMIT) {
    const chunk = references.slice(start, start + DELETE_BATCH_LIMIT);
    await run(() => {
      const batch = writeBatch(firestore);
      chunk.forEach(reference => batch.delete(reference));
      return batch.commit();
    });
  }
}
