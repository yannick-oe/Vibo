/**
 * @file Live message streams and message creation for channel chats.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  FieldPath,
  Firestore,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  collectionData,
  deleteField,
  doc,
  docData,
  increment,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, catchError, of } from 'rxjs';

import { Message, MessageDoc, Reply, ReplyDoc } from '../models/message.model';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

const MESSAGES_LOAD_ERROR = 'Nachrichten konnten nicht geladen werden.';
const NOTIFICATION_SOUND_PATH = 'sounds/chat-notification.mp3';

/**
 * Builds the messages subcollection path of a channel.
 * @param channelId Firestore id of the channel.
 */
export function channelMessagesPath(channelId: string): string {
  return `channels/${channelId}/messages`;
}


/**
 * Builds the messages subcollection path of a direct conversation.
 * @param conversationId Deterministic id of the conversation.
 */
export function directMessagesPath(conversationId: string): string {
  return `directMessages/${conversationId}/messages`;
}


/**
 * Streams the messages of an arbitrary messages collection (channel chat,
 * direct conversation, later thread replies) ordered by creation time and
 * persists new messages with the denormalized thread fields initialized.
 */
@Injectable({ providedIn: 'root' })
export class MessageService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly toastService = inject(ToastService);

  private readonly injector = inject(EnvironmentInjector);

  private readonly notificationSound = new Audio(NOTIFICATION_SOUND_PATH);


  /**
   * Streams a messages collection live, oldest first. Safe to call from
   * reactive callbacks — the query is created in the injection context.
   * @param collectionPath Firestore path of the messages collection.
   */
  streamMessages(collectionPath: string): Observable<Message[]> {
    return runInInjectionContext(this.injector, () => this.queryMessages(collectionPath));
  }


  /**
   * Persists a message authored by the signed-in user with empty reactions
   * and thread counters, matching the data-model defaults.
   * @param collectionPath Firestore path of the target messages collection.
   * @param text Trimmed message text.
   */
  async sendMessage(collectionPath: string, text: string): Promise<void> {
    const message = this.buildMessage(text);
    await runInInjectionContext(this.injector, () =>
      addDoc(collection(this.firestore, collectionPath), message),
    );
    this.playNotificationSound();
  }


  /**
   * Persists a channel message and joins the sender to the channel in the
   * same batch — join-on-send for the new-message flow, where the "#" list
   * shows all channels regardless of membership (see CLAUDE.md). Joining
   * is idempotent for existing members.
   * @param channelId Firestore id of the target channel.
   * @param text Trimmed message text.
   */
  async sendChannelMessageAsJoiner(channelId: string, text: string): Promise<void> {
    const uid = this.authService.requireUid();
    const message = this.buildMessage(text);
    await runInInjectionContext(this.injector, () => {
      const batch = writeBatch(this.firestore);
      batch.set(doc(collection(this.firestore, channelMessagesPath(channelId))), message);
      batch.update(doc(this.firestore, `channels/${channelId}`), { memberIds: arrayUnion(uid) });
      return batch.commit();
    });
    this.playNotificationSound();
  }


  /**
   * Builds a message document authored by the signed-in user with the
   * data-model defaults.
   * @param text Trimmed message text.
   */
  private buildMessage(text: string): MessageDoc {
    return {
      authorId: this.authService.requireUid(),
      text,
      createdAt: serverTimestamp(),
      reactions: {},
      replyCount: 0,
      lastReplyAt: null,
    };
  }


  /**
   * Streams a single message document live, e.g. the origin message of an
   * open thread; emits undefined when the document is missing.
   * @param messagePath Firestore path of the message document.
   */
  streamMessage(messagePath: string): Observable<Message | undefined> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, messagePath), { idField: 'id' }),
    ) as Observable<Message | undefined>;
  }


  /**
   * Streams a message's thread replies live, oldest first.
   * @param messagePath Firestore path of the parent message document.
   */
  streamReplies(messagePath: string): Observable<Reply[]> {
    return runInInjectionContext(this.injector, () => this.queryReplies(messagePath));
  }


  /**
   * Persists a thread reply and atomically updates the parent message's
   * denormalized replyCount and lastReplyAt in the same batched write.
   * @param messagePath Firestore path of the parent message document.
   * @param text Trimmed reply text.
   */
  async sendReply(messagePath: string, text: string): Promise<void> {
    const reply = this.buildReply(text);
    await runInInjectionContext(this.injector, () => {
      const batch = writeBatch(this.firestore);
      batch.set(doc(collection(this.firestore, `${messagePath}/replies`)), reply);
      batch.update(doc(this.firestore, messagePath), {
        replyCount: increment(1),
        lastReplyAt: serverTimestamp(),
      });
      return batch.commit();
    });
    this.playNotificationSound();
  }


  /**
   * Toggles the signed-in user's reaction with the given emoji in one
   * atomic update; the field is removed when the last reactor leaves.
   * @param messagePath Firestore path of the message document.
   * @param emoji Emoji character of the reaction.
   * @param reactorUids Uids currently reacting with this emoji.
   */
  async toggleReaction(messagePath: string, emoji: string, reactorUids: string[]): Promise<void> {
    const uid = this.authService.requireUid();
    const reacted = reactorUids.includes(uid);
    const removesLast = reacted && reactorUids.length === 1;
    const value = removesLast ? deleteField() : reacted ? arrayRemove(uid) : arrayUnion(uid);
    await runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, messagePath), new FieldPath('reactions', emoji), value),
    );
  }


  /**
   * Replaces a message's text after an edit; nothing else changes.
   * @param messagePath Firestore path of the message document.
   * @param text Trimmed new message text.
   */
  editMessage(messagePath: string, text: string): Promise<void> {
    return runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, messagePath), { text }),
    );
  }


  /**
   * Hides a message for the signed-in user only (delete for me); other
   * participants and the thread counters stay unaffected.
   * @param messagePath Firestore path of the message document.
   */
  hideForMe(messagePath: string): Promise<void> {
    const uid = this.authService.requireUid();
    return runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, messagePath), { hiddenFor: arrayUnion(uid) }),
    );
  }


  /**
   * Deletes a message for everyone: text and reactions are cleared and the
   * row renders as a tombstone; thread replies stay reachable.
   * @param messagePath Firestore path of the message document.
   */
  deleteForAll(messagePath: string): Promise<void> {
    const uid = this.authService.requireUid();
    return runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, messagePath), {
        deletedAt: serverTimestamp(),
        deletedBy: uid,
        text: '',
        reactions: {},
      }),
    );
  }


  /**
   * Builds a reply document authored by the signed-in user.
   * @param text Trimmed reply text.
   */
  private buildReply(text: string): ReplyDoc {
    return {
      authorId: this.authService.requireUid(),
      text,
      createdAt: serverTimestamp(),
      reactions: {},
    };
  }


  /**
   * Builds the live replies query; on Firestore errors a toast is shown
   * and an empty list keeps the UI functional.
   * @param messagePath Firestore path of the parent message document.
   */
  private queryReplies(messagePath: string): Observable<Reply[]> {
    const repliesQuery = query(
      collection(this.firestore, `${messagePath}/replies`),
      orderBy('createdAt'),
    );
    return (collectionData(repliesQuery, { idField: 'id' }) as Observable<Reply[]>).pipe(
      catchError(() => this.reportLoadError()),
    );
  }


  /**
   * Builds the live query; on Firestore errors a toast is shown and an
   * empty list keeps the UI functional.
   * @param collectionPath Firestore path of the messages collection.
   */
  private queryMessages(collectionPath: string): Observable<Message[]> {
    const messagesQuery = query(
      collection(this.firestore, collectionPath),
      orderBy('createdAt'),
    );
    return (collectionData(messagesQuery, { idField: 'id' }) as Observable<Message[]>).pipe(
      catchError(() => this.reportLoadError()),
    );
  }


  /**
   * Plays the chat notification sound, restarting it if already playing.
   * Rejections are swallowed because browsers block autoplay until the
   * first user gesture.
   */
  private playNotificationSound(): void {
    this.notificationSound.currentTime = 0;
    this.notificationSound.play().catch(() => undefined);
  }


  /**
   * Shows the load-error toast and recovers with an empty list.
   */
  private reportLoadError(): Observable<Message[]> {
    this.toastService.show(MESSAGES_LOAD_ERROR);
    return of([]);
  }
}
