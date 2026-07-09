/**
 * @file Sender-side fan-out of activity notifications. Thread replies and
 * reactions are not observable through the existing small-doc streams and
 * broad message listeners are off-budget (§14), so the ACTING client writes
 * one shape-validated notification document into each recipient's own
 * users/{uid}/notifications collection (create-only for foreign users in the
 * rules). Writes are fire-and-forget like the big-reaction broadcast — the
 * message/reaction write itself surfaces failures.
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { Firestore, collection, doc, serverTimestamp, setDoc } from '@angular/fire/firestore';

import { ChatEntry, Message } from '../models/message.model';
import { NotificationDoc, NotificationKind } from '../models/notification.model';
import { AuthService } from './auth.service';
import { ChannelService } from './channel.service';
import { UserService } from './user.service';
import { previewOf } from './notification.util';
import {
  NotificationTarget,
  resolveMentionedUids,
  targetFieldsOf,
  targetOfMessagePath,
} from './notification-feed.util';

const NOTIFICATIONS_SEGMENT = 'notifications';

/**
 * Writes activity notifications to the affected users when the signed-in
 * user reacts to a message, replies in a thread or @mentions someone.
 */
@Injectable({ providedIn: 'root' })
export class NotificationFanoutService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly channelService = inject(ChannelService);

  private readonly userService = inject(UserService);

  private readonly injector = inject(EnvironmentInjector);


  /**
   * Notifies the author of a message or reply that the signed-in user just
   * reacted to it; own messages never notify.
   * @param messagePath Firestore path of the reacted message or reply.
   * @param entry Reacted message or reply (author, text, GIF flag).
   * @param emoji Added reaction emoji character.
   */
  reactionAdded(messagePath: string, entry: ChatEntry, emoji: string): void {
    const target = targetOfMessagePath(messagePath);
    const me = this.authService.currentUser()?.uid;
    if (!target || !me || entry.authorId === me) return;
    this.write(entry.authorId, target, {
      kind: 'reaction',
      actorUid: me,
      emoji,
      preview: previewOf(entry),
    });
  }


  /**
   * Notifies everyone @mentioned in a sent message or reply and returns the
   * notified uids so the caller can suppress a duplicate thread-reply entry
   * for them (one action = one bell entry, mention wins).
   * @param messagePath Firestore path of the sent message or reply.
   * @param text Sent text carrying the @mentions.
   */
  mentionsSent(messagePath: string, text: string): string[] {
    const target = targetOfMessagePath(messagePath);
    const me = this.authService.currentUser()?.uid;
    if (!target || !me) return [];
    const payload = { kind: 'mention' as NotificationKind, actorUid: me, preview: previewOf({ text }) };
    const uids = resolveMentionedUids(text, this.userService.users()).filter(uid => uid !== me);
    return uids.filter(uid => this.write(uid, target, payload));
  }


  /**
   * Notifies the author of an answered MAIN-stream message that the signed-in
   * user just replied to it inline ("Antworten"); own messages never notify and
   * an already-mentioned recipient is skipped (mention supersedes reply).
   * @param messagePath Firestore path of the answering message.
   * @param recipientUid Author of the answered message.
   * @param text Sent reply text ('' for a GIF reply).
   * @param exclude Recipients already notified with a higher-priority entry.
   * @param gifUrl Animated GIF URL when the reply is a GIF (previews as "GIF").
   */
  replySent(messagePath: string, recipientUid: string, text: string, exclude: string[] = [], gifUrl?: string): void {
    const target = targetOfMessagePath(messagePath);
    const me = this.authService.currentUser()?.uid;
    if (!target || !me || recipientUid === me || exclude.includes(recipientUid)) return;
    this.write(recipientUid, target, {
      kind: 'reply',
      actorUid: me,
      preview: previewOf({ text, gifUrl }),
    });
  }


  /**
   * Notifies the thread's followers (root author plus everyone who posted a
   * reply) that the signed-in user just replied; the actor and any excluded
   * (already-mentioned) recipients are skipped. A thread reply is always a
   * thread event, so its notifications are stored with inThread=true even
   * though they address the root message id.
   * @param rootPath Firestore path of the thread's root message.
   * @param root Root message before the reply (author and participants).
   * @param text Trimmed reply text ('' for a GIF reply).
   * @param exclude Recipients already notified with a higher-priority entry.
   * @param gifUrl Animated GIF URL when the reply is a GIF (previews as "GIF").
   */
  threadReplySent(rootPath: string, root: Message, text: string, exclude: string[] = [], gifUrl?: string): void {
    const base = targetOfMessagePath(rootPath);
    const me = this.authService.currentUser()?.uid;
    if (!base || !me) return;
    const target: NotificationTarget = { ...base, inThread: true };
    const payload = { kind: 'thread-reply' as NotificationKind, actorUid: me, preview: previewOf({ text, gifUrl }) };
    const recipients = threadRecipients(root, me).filter(uid => !exclude.includes(uid));
    for (const uid of recipients) this.write(uid, target, payload);
  }


  /**
   * Writes one notification document into a recipient's collection, skipping
   * unreachable recipients (the rules enforce the same membership).
   * @param recipientUid Uid of the notified user.
   * @param target Parsed conversation target of the activity.
   * @param payload Kind-specific notification fields.
   * @returns Whether the recipient was reachable and a write was issued.
   */
  private write(recipientUid: string, target: NotificationTarget, payload: Partial<NotificationDoc>): boolean {
    if (!this.isReachable(recipientUid, target)) return false;
    const data: Partial<NotificationDoc> = {
      ...payload,
      ...targetFieldsOf(target),
      messageId: target.messageId,
      inThread: target.inThread,
      createdAt: serverTimestamp(),
    };
    void runInInjectionContext(this.injector, () =>
      setDoc(doc(collection(this.firestore, `users/${recipientUid}/${NOTIFICATIONS_SEGMENT}`)), data),
    ).catch(() => undefined);
    return true;
  }


  /**
   * Whether a recipient may receive the notification: channel events require
   * current membership, direct-message events require the recipient to be a
   * participant of the conversation (proven from its deterministic id) — so a
   * mention of a non-participant in a DM is never written.
   * @param recipientUid Uid of the notified user.
   * @param target Parsed conversation target of the activity.
   */
  private isReachable(recipientUid: string, target: NotificationTarget): boolean {
    if (target.channelId === null) {
      return target.conversationId?.split('_').includes(recipientUid) ?? false;
    }
    const channel = this.channelService.channels().find(item => item.id === target.channelId);
    return channel === undefined || channel.memberIds.includes(recipientUid);
  }
}


/**
 * Distinct recipients of a thread reply: the root author plus all recorded
 * thread participants, excluding the acting user.
 * @param root Root message of the thread.
 * @param me Acting user's uid.
 */
function threadRecipients(root: Message, me: string): string[] {
  const uids = new Set([root.authorId, ...(root.participantUids ?? [])]);
  uids.delete(me);
  return [...uids];
}
