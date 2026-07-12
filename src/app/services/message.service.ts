/**
 * @file Live message streams and message creation for channel chats.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  FieldValue,
  Firestore,
  arrayUnion,
  collection,
  collectionData,
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

import { GifResult } from '../models/gif.model';
import { Message, MessageDoc, ReactionMap, Reply, ReplyDoc, ReplyRef } from '../models/message.model';
import { ConversationWindow } from './conversation-window';
import { applyReaction } from './message-reactions';
import { buildGifMessage, buildGifReply, buildMessage, buildReply } from './message-build';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

const MESSAGES_LOAD_ERROR = 'Nachrichten konnten nicht geladen werden.';
const NOTIFICATION_SOUND_PATH = 'sounds/chat-notification.mp3';
const MESSAGES_SEGMENT = '/messages';


/**
 * Strips the trailing "/messages" segment off a messages-collection path to
 * get the owning conversation document (channel or direct conversation).
 * @param messagesPath Path of a messages subcollection.
 */
export function conversationDocPath(messagesPath: string): string {
  return messagesPath.slice(0, -MESSAGES_SEGMENT.length);
}

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
   * Opens a windowed, paginated view over a conversation's messages: one live
   * listener on the newest page plus on-demand older pages. Destroy it on a
   * context switch. Load errors reuse the shared messages-load toast.
   * @param collectionPath Firestore path of the messages collection.
   */
  openWindow(collectionPath: string): ConversationWindow {
    return new ConversationWindow(this.firestore, this.injector, collectionPath, () =>
      this.toastService.show(MESSAGES_LOAD_ERROR),
    );
  }


  /**
   * Persists a message authored by the signed-in user with empty reactions
   * and thread counters, matching the data-model defaults; an inline-reply
   * reference is stored when the message answers another one.
   * @param collectionPath Firestore path of the target messages collection.
   * @param text Trimmed message text.
   * @param replyTo Inline-reply reference when answering another message.
   * @returns The created message's Firestore id.
   */
  async sendMessage(collectionPath: string, text: string, replyTo?: ReplyRef): Promise<string> {
    return this.commitMessage(collectionPath, buildMessage(this.authService.requireUid(), text, replyTo));
  }


  /**
   * Persists a Giphy GIF as a message (no text) authored by the signed-in user.
   * @param collectionPath Firestore path of the target messages collection.
   * @param gif Selected GIF result.
   * @param replyTo Inline-reply reference when answering another message.
   * @returns The created message's Firestore id.
   */
  async sendGif(collectionPath: string, gif: GifResult, replyTo?: ReplyRef): Promise<string> {
    return this.commitMessage(collectionPath, buildGifMessage(this.authService.requireUid(), gif, replyTo));
  }


  /**
   * Writes a built message and stamps the conversation's last-message metadata
   * in one batch, then plays the notification sound.
   * @param collectionPath Firestore path of the target messages collection.
   * @param message Fully built message document.
   * @returns The created message's Firestore id.
   */
  private async commitMessage(collectionPath: string, message: MessageDoc): Promise<string> {
    const ref = await runInInjectionContext(this.injector, () => {
      const messageRef = doc(collection(this.firestore, collectionPath));
      const batch = writeBatch(this.firestore);
      batch.set(messageRef, message);
      batch.update(doc(this.firestore, conversationDocPath(collectionPath)), this.lastMessagePatch());
      return batch.commit().then(() => messageRef);
    });
    this.playNotificationSound();
    return ref.id;
  }


  /**
   * Builds the denormalized last-message patch stamped onto the conversation
   * document in the same batch as a message create, so the sidebar can detect
   * "new since I last read" from one small doc instead of streaming messages.
   */
  private lastMessagePatch(): { lastMessageAt: FieldValue; lastMessageAuthorId: string } {
    return { lastMessageAt: serverTimestamp(), lastMessageAuthorId: this.authService.requireUid() };
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
    const message = buildMessage(uid, text);
    await runInInjectionContext(this.injector, () => {
      const batch = writeBatch(this.firestore);
      batch.set(doc(collection(this.firestore, channelMessagesPath(channelId))), message);
      batch.update(doc(this.firestore, `channels/${channelId}`), {
        memberIds: arrayUnion(uid),
        ...this.lastMessagePatch(),
      });
      return batch.commit();
    });
    this.playNotificationSound();
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
   * Persists a thread reply authored by the signed-in user.
   * @param messagePath Firestore path of the parent message document.
   * @param text Trimmed reply text.
   * @returns The created reply's Firestore id.
   */
  async sendReply(messagePath: string, text: string): Promise<string> {
    return this.commitReply(messagePath, buildReply(this.authService.requireUid(), text));
  }


  /**
   * Persists a Giphy GIF as a thread reply (no text) authored by the
   * signed-in user.
   * @param messagePath Firestore path of the parent message document.
   * @param gif Selected GIF result.
   * @returns The created reply's Firestore id.
   */
  async sendGifReply(messagePath: string, gif: GifResult): Promise<string> {
    return this.commitReply(messagePath, buildGifReply(this.authService.requireUid(), gif));
  }


  /**
   * Writes a built reply and atomically bumps the parent's denormalized
   * thread fields in one batch, then plays the notification sound.
   * @param messagePath Firestore path of the parent message document.
   * @param reply Fully built reply document.
   * @returns The created reply's Firestore id.
   */
  private async commitReply(messagePath: string, reply: ReplyDoc): Promise<string> {
    const ref = await runInInjectionContext(this.injector, () => {
      const replyRef = doc(collection(this.firestore, `${messagePath}/replies`));
      const batch = writeBatch(this.firestore);
      batch.set(replyRef, reply);
      batch.update(doc(this.firestore, messagePath), this.replyBumpPatch());
      return batch.commit().then(() => replyRef);
    });
    this.playNotificationSound();
    return ref.id;
  }


  /**
   * The parent-message patch stamped in the same batch as a reply create:
   * bumps replyCount/lastReplyAt and self-appends to participantUids so
   * later replies can fan thread notifications out to this author.
   */
  private replyBumpPatch(): { replyCount: FieldValue; lastReplyAt: FieldValue; participantUids: FieldValue } {
    return {
      replyCount: increment(1),
      lastReplyAt: serverTimestamp(),
      participantUids: arrayUnion(this.authService.requireUid()),
    };
  }


  /**
   * Sets the signed-in user's single reaction to `emoji` in one atomic update:
   * the user is removed from any reaction they already hold and added to the
   * chosen one, or removed entirely when re-selecting their current reaction.
   * @param messagePath Firestore path of the message document.
   * @param emoji Chosen reaction emoji character.
   * @param reactions Current reaction map of the message.
   */
  async setReaction(messagePath: string, emoji: string, reactions: ReactionMap): Promise<void> {
    const uid = this.authService.requireUid();
    const ref = doc(this.firestore, messagePath);
    await runInInjectionContext(this.injector, () => applyReaction(ref, reactions, emoji, uid));
  }


  /**
   * Replaces a message's text after an edit and stamps the edit time; the
   * original createdAt, reactions, and read state are untouched.
   * @param messagePath Firestore path of the message document.
   * @param text Trimmed new message text.
   */
  editMessage(messagePath: string, text: string): Promise<void> {
    return runInInjectionContext(this.injector, () =>
      updateDoc(doc(this.firestore, messagePath), { text, editedAt: serverTimestamp() }),
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
