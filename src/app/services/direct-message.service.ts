/**
 * @file Direct-message conversations: deterministic ids, lazy conversation
 * documents (friendship-gated for new pairs), the live conversation list
 * and message streaming via the shared message service.
 */
import {
  EnvironmentInjector,
  Injectable,
  computed,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  DocumentReference,
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, catchError, of, switchMap } from 'rxjs';

import { DirectMessageDoc, buildConversationId } from '../models/direct-message.model';
import { GifResult } from '../models/gif.model';
import { ReplyRef } from '../models/message.model';
import { AuthService } from './auth.service';
import { FriendshipService } from './friendship.service';
import { MessageService, directMessagesPath } from './message.service';
import { ToastService } from './toast.service';

const DM_COLLECTION = 'directMessages';
const PARTICIPANT_IDS_FIELD = 'participantIds';
const FRIENDSHIP_REQUIRED_MESSAGE = 'Neue Unterhaltungen sind nur mit Freunden möglich.';

/**
 * Data access for direct conversations. The conversation document at
 * directMessages/{conversationId} is created lazily with the first sent
 * message — conversations that were only opened never produce a document.
 * Creating a NEW conversation requires an accepted friendship (self-DM
 * exempt); existing conversations are grandfathered and keep working.
 */
@Injectable({ providedIn: 'root' })
export class DirectMessageService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly friendshipService = inject(FriendshipService);

  private readonly messageService = inject(MessageService);

  private readonly toastService = inject(ToastService);

  private readonly injector = inject(EnvironmentInjector);

  readonly conversations = toSignal(this.streamConversations(), {
    initialValue: [] as DirectMessageDoc[],
  });

  /** Partner uids of every conversation that already exists. */
  readonly conversationPartnerUids = computed(() => this.collectPartnerUids());


  /**
   * Sends a message to the partner, creating the conversation document on
   * the first message. A blocked (non-friend) new conversation shows a
   * toast and sends nothing.
   * @param partnerUid Uid of the conversation partner.
   * @param text Trimmed message text.
   * @param replyTo Inline-reply reference when answering another message.
   * @returns The created message's id, or null when the send was blocked.
   */
  async send(partnerUid: string, text: string, replyTo?: ReplyRef): Promise<string | null> {
    const conversationId = this.conversationIdWith(partnerUid);
    if (!(await this.prepareConversation(conversationId, partnerUid))) return null;
    return this.messageService.sendMessage(directMessagesPath(conversationId), text, replyTo);
  }


  /**
   * Sends a GIF to the partner, creating the conversation document on the
   * first message. A blocked (non-friend) new conversation shows a toast
   * and sends nothing.
   * @param partnerUid Uid of the conversation partner.
   * @param gif Selected GIF result.
   * @param replyTo Inline-reply reference when answering another message.
   * @returns The created message's id, or null when the send was blocked.
   */
  async sendGif(partnerUid: string, gif: GifResult, replyTo?: ReplyRef): Promise<string | null> {
    const conversationId = this.conversationIdWith(partnerUid);
    if (!(await this.prepareConversation(conversationId, partnerUid))) return null;
    return this.messageService.sendGif(directMessagesPath(conversationId), gif, replyTo);
  }


  /**
   * Builds the Firestore path of the messages collection of the
   * conversation with the given partner.
   * @param partnerUid Uid of the conversation partner.
   */
  messagesPathWith(partnerUid: string): string {
    return directMessagesPath(this.conversationIdWith(partnerUid));
  }


  /**
   * Builds the Firestore path of a message document in the conversation
   * with the given partner, e.g. for opening its thread.
   * @param partnerUid Uid of the conversation partner.
   * @param messageId Firestore id of the message.
   */
  messagePathFor(partnerUid: string, messageId: string): string {
    return `${this.messagesPathWith(partnerUid)}/${messageId}`;
  }


  /**
   * Builds the deterministic conversation id for the signed-in user and a
   * partner (both uids sorted, joined with "_").
   * @param partnerUid Uid of the conversation partner.
   */
  private conversationIdWith(partnerUid: string): string {
    return buildConversationId(this.authService.requireUid(), partnerUid);
  }


  /**
   * Ensures the conversation document exists before a send. Existing
   * conversations always pass (grandfathered); a new one is only created
   * for self-DMs or accepted friends, otherwise a toast explains the block.
   * @param conversationId Deterministic id of the conversation.
   * @param partnerUid Uid of the conversation partner.
   * @returns Whether sending may proceed.
   */
  private async prepareConversation(conversationId: string, partnerUid: string): Promise<boolean> {
    const reference = runInInjectionContext(this.injector, () =>
      doc(this.firestore, `${DM_COLLECTION}/${conversationId}`),
    );
    const snapshot = await runInInjectionContext(this.injector, () => getDoc(reference));
    if (snapshot.exists()) return true;
    if (!this.mayStartConversationWith(partnerUid)) {
      this.toastService.show(FRIENDSHIP_REQUIRED_MESSAGE);
      return false;
    }
    await this.createConversation(reference, partnerUid);
    return true;
  }


  /**
   * Reports whether a new conversation with the partner may be created:
   * the self conversation is exempt, everyone else needs an accepted
   * friendship.
   * @param partnerUid Uid of the conversation partner.
   */
  private mayStartConversationWith(partnerUid: string): boolean {
    if (partnerUid === this.authService.requireUid()) return true;
    return this.friendshipService.friendUids().has(partnerUid);
  }


  /**
   * Writes the conversation document for a permitted new conversation.
   * @param reference Document reference of the conversation.
   * @param partnerUid Uid of the conversation partner.
   */
  private async createConversation(
    reference: DocumentReference,
    partnerUid: string,
  ): Promise<void> {
    const conversation: DirectMessageDoc = {
      participantIds: sortedParticipants(this.authService.requireUid(), partnerUid),
      createdAt: serverTimestamp(),
    };
    await runInInjectionContext(this.injector, () => setDoc(reference, conversation));
  }


  /**
   * Streams the signed-in user's existing conversations; emits an empty
   * list while signed out so the subscription never reads without
   * permission.
   */
  private streamConversations(): Observable<DirectMessageDoc[]> {
    return toObservable(this.authService.currentUser).pipe(
      switchMap(current =>
        current
          ? runInInjectionContext(this.injector, () => this.queryConversations(current.uid))
          : of([]),
      ),
    );
  }


  /**
   * Reads all conversations containing the given uid live; errors recover
   * with an empty list so the UI stays functional.
   * @param uid Uid whose conversations to stream.
   */
  private queryConversations(uid: string): Observable<DirectMessageDoc[]> {
    const conversationsQuery = query(
      collection(this.firestore, DM_COLLECTION),
      where(PARTICIPANT_IDS_FIELD, 'array-contains', uid),
    );
    return (collectionData(conversationsQuery) as Observable<DirectMessageDoc[]>).pipe(
      catchError(() => of([])),
    );
  }


  /**
   * Collects the partner uid of every existing conversation (the self
   * conversation contributes no partner).
   */
  private collectPartnerUids(): ReadonlySet<string> {
    const me = this.authService.currentUser()?.uid;
    if (!me) return new Set();
    const partners = this.conversations()
      .flatMap(conversation => conversation.participantIds)
      .filter(uid => uid !== me);
    return new Set(partners);
  }
}


/**
 * Sorts the two participant uids ascending, matching the id convention.
 * @param uidA First participant uid.
 * @param uidB Second participant uid.
 */
function sortedParticipants(uidA: string, uidB: string): [string, string] {
  return [uidA, uidB].sort() as [string, string];
}
