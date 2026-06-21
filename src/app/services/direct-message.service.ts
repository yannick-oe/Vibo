/**
 * @file Direct-message conversations: deterministic ids, lazy conversation
 * documents and message streaming via the shared message service.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Firestore, doc, getDoc, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { Observable, of, switchMap } from 'rxjs';

import { DirectMessageDoc, buildConversationId } from '../models/direct-message.model';
import { GifResult } from '../models/gif.model';
import { Message } from '../models/message.model';
import { AuthService } from './auth.service';
import { MessageService, directMessagesPath } from './message.service';

/**
 * Data access for direct conversations. The conversation document at
 * directMessages/{conversationId} is created lazily with the first sent
 * message — conversations that were only opened never produce a document.
 */
@Injectable({ providedIn: 'root' })
export class DirectMessageService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly messageService = inject(MessageService);

  private readonly injector = inject(EnvironmentInjector);


  /**
   * Streams the conversation with the given partner live, oldest first.
   * Reacts to the auth state instead of assuming it: on a hard reload the
   * session is restored asynchronously, so the stream stays empty until
   * the signed-in user is known.
   * @param partnerUid Uid of the conversation partner (own uid for the
   * self conversation).
   */
  streamMessagesWith(partnerUid: string): Observable<Message[]> {
    return runInInjectionContext(this.injector, () =>
      toObservable(this.authService.currentUser),
    ).pipe(
      switchMap(current =>
        current
          ? this.messageService.streamMessages(
              directMessagesPath(buildConversationId(current.uid, partnerUid)),
            )
          : of([]),
      ),
    );
  }


  /**
   * Sends a message to the partner, creating the conversation document on
   * the first message.
   * @param partnerUid Uid of the conversation partner.
   * @param text Trimmed message text.
   */
  async send(partnerUid: string, text: string): Promise<void> {
    const conversationId = this.conversationIdWith(partnerUid);
    await this.ensureConversation(conversationId, partnerUid);
    await this.messageService.sendMessage(directMessagesPath(conversationId), text);
  }


  /**
   * Sends a GIF to the partner, creating the conversation document on the
   * first message.
   * @param partnerUid Uid of the conversation partner.
   * @param gif Selected GIF result.
   */
  async sendGif(partnerUid: string, gif: GifResult): Promise<void> {
    const conversationId = this.conversationIdWith(partnerUid);
    await this.ensureConversation(conversationId, partnerUid);
    await this.messageService.sendGif(directMessagesPath(conversationId), gif);
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
   * Creates the conversation document if it does not exist yet.
   * @param conversationId Deterministic id of the conversation.
   * @param partnerUid Uid of the conversation partner.
   */
  private async ensureConversation(conversationId: string, partnerUid: string): Promise<void> {
    const reference = runInInjectionContext(this.injector, () =>
      doc(this.firestore, `directMessages/${conversationId}`),
    );
    const snapshot = await runInInjectionContext(this.injector, () => getDoc(reference));
    if (snapshot.exists()) return;
    const conversation: DirectMessageDoc = {
      participantIds: sortedParticipants(this.authService.requireUid(), partnerUid),
      createdAt: serverTimestamp(),
    };
    await runInInjectionContext(this.injector, () => setDoc(reference, conversation));
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
