/**
 * @file Per-user conversation read state. Marks conversations read for the
 * signed-in user and exposes the small pieces the sidebar needs to derive
 * unread indicators: a conversation's denormalized last-message metadata, the
 * user's read marker, and an aggregation count of unread messages. It never
 * streams whole message collections — only one small doc per conversation.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  Query,
  Timestamp,
  collection,
  doc,
  docData,
  getCountFromServer,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { AuthService } from './auth.service';

const READS_SEGMENT = 'reads';
const CREATED_AT_FIELD = 'createdAt';
const AUTHOR_ID_FIELD = 'authorId';

/** Denormalized last-message metadata read from a conversation document. */
export interface ConversationMeta {
  readonly lastMessageAt?: Timestamp;
  readonly lastMessageAuthorId?: string;
}

/** A user's read marker stored at <conversation>/reads/{uid}. */
export interface ReadMarker {
  readonly lastReadAt?: Timestamp;
}

/**
 * Reads and writes conversation read state for channels and direct messages
 * alike; all paths are conversation-document paths (the reads subcollection
 * is co-located so a later receipts pass can read every participant's state).
 */
@Injectable({ providedIn: 'root' })
export class ReadStateService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly injector = inject(EnvironmentInjector);


  /**
   * Marks a conversation read for the signed-in user (lastReadAt = now), so
   * the currently-open conversation always shows zero unread.
   * @param conversationPath Path of the conversation document.
   */
  markRead(conversationPath: string): Promise<void> {
    const path = this.readPath(conversationPath, this.authService.requireUid());
    return runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, path), { lastReadAt: serverTimestamp() }, { merge: true }),
    );
  }


  /**
   * Streams a conversation's denormalized last-message metadata live.
   * @param conversationPath Path of the conversation document.
   */
  conversationMeta(conversationPath: string): Observable<ConversationMeta | undefined> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, conversationPath)),
    ) as Observable<ConversationMeta | undefined>;
  }


  /**
   * Streams a user's read marker for a conversation live.
   * @param conversationPath Path of the conversation document.
   * @param uid Uid whose read marker is read.
   */
  readMarker(conversationPath: string, uid: string): Observable<ReadMarker | undefined> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, this.readPath(conversationPath, uid))),
    ) as Observable<ReadMarker | undefined>;
  }


  /**
   * Counts unread messages via a server-side aggregation: messages newer than
   * `since` that were not authored by `uid`. A null `since` counts everything
   * not authored by the user (no read marker yet means unread from the epoch).
   * @param messagesPath Path of the conversation's messages collection.
   * @param since Exclusive lower bound, or null for "from the epoch".
   * @param uid Uid whose own messages are excluded.
   */
  async countUnread(messagesPath: string, since: Timestamp | null, uid: string): Promise<number> {
    const snapshot = await runInInjectionContext(this.injector, () =>
      getCountFromServer(this.unreadQuery(messagesPath, since, uid)),
    );
    return snapshot.data().count;
  }


  /**
   * Builds the read-marker document path for a conversation and user.
   * @param conversationPath Path of the conversation document.
   * @param uid Uid owning the read marker.
   */
  private readPath(conversationPath: string, uid: string): string {
    return `${conversationPath}/${READS_SEGMENT}/${uid}`;
  }


  /**
   * Builds the unread aggregation query for a messages collection.
   * @param messagesPath Path of the messages collection.
   * @param since Exclusive lower bound on createdAt, or null.
   * @param uid Uid whose own messages are excluded.
   */
  private unreadQuery(messagesPath: string, since: Timestamp | null, uid: string): Query {
    const base = collection(this.firestore, messagesPath);
    const notMine = where(AUTHOR_ID_FIELD, '!=', uid);
    return since === null
      ? query(base, notMine)
      : query(base, where(CREATED_AT_FIELD, '>', since), notMine);
  }
}
