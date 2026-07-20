/**
 * @file Message creation, mutations and the windowed live view for channel
 * and direct-message chats; thread read streams live in
 * ThreadStreamsService, path helpers in message-paths.ts.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  FieldValue,
  Firestore,
  arrayUnion,
  collection,
  doc,
  increment,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from '@angular/fire/firestore';

import { GifResult } from '../models/gif.model';
import { MessageDoc, ReactionMap, ReplyDoc, ReplyRef } from '../models/message.model';
import { ConversationWindow } from './conversation-window';
import { channelMessagesPath, conversationDocPath } from './message-paths';
import { applyReaction } from './message-reactions';
import { buildGifMessage, buildGifReply, buildJoinMessage, buildMessage, buildReply } from './message-build';
import { AuthService } from './auth.service';
import { SoundService } from './sound.service';
import { ToastService } from './toast.service';

export { channelMessagesPath, conversationDocPath, directMessagesPath } from './message-paths';

/** Shared load-error toast for message and thread streams. */
export const MESSAGES_LOAD_ERROR = 'Nachrichten konnten nicht geladen werden.';


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

  private readonly soundService = inject(SoundService);

  private readonly injector = inject(EnvironmentInjector);


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
   * in one batch. The send sound plays optimistically at the start (the user's
   * action, never a snapshot echo); a rejected commit adds the error sound.
   * @param collectionPath Firestore path of the target messages collection.
   * @param message Fully built message document.
   * @returns The created message's Firestore id.
   */
  private async commitMessage(collectionPath: string, message: MessageDoc): Promise<string> {
    this.soundService.play('send');
    const ref = await this.withErrorSound(() =>
      runInInjectionContext(this.injector, () => {
        const messageRef = doc(collection(this.firestore, collectionPath));
        const batch = writeBatch(this.firestore);
        batch.set(messageRef, message);
        batch.update(doc(this.firestore, conversationDocPath(collectionPath)), this.lastMessagePatch());
        return batch.commit().then(() => messageRef);
      }),
    );
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
   * @param announceJoin Whether this send makes the sender a member (also writes the join pill).
   */
  async sendChannelMessageAsJoiner(channelId: string, text: string, announceJoin = false): Promise<void> {
    const uid = this.authService.requireUid();
    this.soundService.play('send');
    await this.withErrorSound(() =>
      runInInjectionContext(this.injector, () =>
        this.commitJoinerBatch(channelId, uid, text, announceJoin),
      ),
    );
  }


  /**
   * Commits the join-on-send batch: for a first-time sender the join system
   * message, then the chat message, the membership append and the
   * last-message bump on the channel doc — one atomic write.
   * @param channelId Target channel id.
   * @param uid Sending user's uid.
   * @param text Trimmed message text.
   * @param announceJoin Whether the sender joins with this send (writes the join pill).
   */
  private commitJoinerBatch(channelId: string, uid: string, text: string, announceJoin: boolean): Promise<void> {
    const messages = collection(this.firestore, channelMessagesPath(channelId));
    const batch = writeBatch(this.firestore);
    if (announceJoin) batch.set(doc(messages), buildJoinMessage(uid));
    batch.set(doc(messages), buildMessage(uid, text));
    batch.update(doc(this.firestore, `channels/${channelId}`), {
      memberIds: arrayUnion(uid),
      ...this.lastMessagePatch(),
    });
    return batch.commit();
  }


  /**
   * Writes the signed-in user's channel-join system message and bumps the
   * channel's last-message denormalization; deliberately silent (joining is
   * not a chat send, so no send sound plays).
   * @param channelId Id of the joined channel.
   */
  async sendJoinMessage(channelId: string): Promise<void> {
    const uid = this.authService.requireUid();
    await this.withErrorSound(() =>
      runInInjectionContext(this.injector, () => {
        const batch = writeBatch(this.firestore);
        batch.set(doc(collection(this.firestore, channelMessagesPath(channelId))), buildJoinMessage(uid));
        batch.update(doc(this.firestore, `channels/${channelId}`), this.lastMessagePatch());
        return batch.commit();
      }),
    );
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
   * thread fields in one batch. The send sound plays optimistically at the
   * start; a rejected commit adds the error sound.
   * @param messagePath Firestore path of the parent message document.
   * @param reply Fully built reply document.
   * @returns The created reply's Firestore id.
   */
  private async commitReply(messagePath: string, reply: ReplyDoc): Promise<string> {
    this.soundService.play('send');
    const ref = await this.withErrorSound(() =>
      runInInjectionContext(this.injector, () => {
        const replyRef = doc(collection(this.firestore, `${messagePath}/replies`));
        const batch = writeBatch(this.firestore);
        batch.set(replyRef, reply);
        batch.update(doc(this.firestore, messagePath), this.replyBumpPatch());
        return batch.commit().then(() => replyRef);
      }),
    );
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
    await this.withErrorSound(() =>
      runInInjectionContext(this.injector, () => applyReaction(ref, reactions, emoji, uid)),
    );
  }


  /**
   * Replaces a message's text after an edit and stamps the edit time; the
   * original createdAt, reactions, and read state are untouched.
   * @param messagePath Firestore path of the message document.
   * @param text Trimmed new message text.
   */
  editMessage(messagePath: string, text: string): Promise<void> {
    return this.withErrorSound(() =>
      runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, messagePath), { text, editedAt: serverTimestamp() }),
      ),
    );
  }


  /**
   * Hides a message for the signed-in user only (delete for me); other
   * participants and the thread counters stay unaffected.
   * @param messagePath Firestore path of the message document.
   */
  hideForMe(messagePath: string): Promise<void> {
    const uid = this.authService.requireUid();
    return this.withErrorSound(() =>
      runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, messagePath), { hiddenFor: arrayUnion(uid) }),
      ),
    );
  }


  /**
   * Deletes a message for everyone: text and reactions are cleared and the
   * row renders as a tombstone; thread replies stay reachable.
   * @param messagePath Firestore path of the message document.
   */
  deleteForAll(messagePath: string): Promise<void> {
    const uid = this.authService.requireUid();
    return this.withErrorSound(() =>
      runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, messagePath), {
          deletedAt: serverTimestamp(),
          deletedBy: uid,
          text: '',
          reactions: {},
        }),
      ),
    );
  }


  /**
   * Runs a message mutation and plays the error sound when it rejects; the
   * rejection is rethrown so the callers' existing error handlers (toasts,
   * optimistic-UI rollbacks) stay the single source of user feedback.
   * @param operation Asynchronous Firestore mutation.
   */
  private async withErrorSound<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.soundService.play('error');
      throw error;
    }
  }
}
