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
import { previewOf } from './notification.util';
import { NotificationTarget, targetFieldsOf, targetOfMessagePath } from './notification-feed.util';

const NOTIFICATIONS_SEGMENT = 'notifications';

/**
 * Writes activity notifications to the affected users when the signed-in
 * user reacts to a message or replies in a thread.
 */
@Injectable({ providedIn: 'root' })
export class NotificationFanoutService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly channelService = inject(ChannelService);

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
   * Notifies the thread's followers (root author plus everyone who posted a
   * reply) that the signed-in user just replied; the actor never notifies
   * themselves.
   * @param rootPath Firestore path of the thread's root message.
   * @param root Root message before the reply (author and participants).
   * @param text Trimmed reply text.
   */
  threadReplySent(rootPath: string, root: Message, text: string): void {
    const target = targetOfMessagePath(rootPath);
    const me = this.authService.currentUser()?.uid;
    if (!target || !me) return;
    const payload = { kind: 'thread-reply' as NotificationKind, actorUid: me, preview: previewOf({ text }) };
    for (const uid of threadRecipients(root, me)) this.write(uid, target, payload);
  }


  /**
   * Writes one notification document into a recipient's collection;
   * recipients no longer in the target channel are skipped (the rules
   * enforce the same membership requirement).
   * @param recipientUid Uid of the notified user.
   * @param target Parsed conversation target of the activity.
   * @param payload Kind-specific notification fields.
   */
  private write(recipientUid: string, target: NotificationTarget, payload: Partial<NotificationDoc>): void {
    if (!this.isReachable(recipientUid, target)) return;
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
  }


  /**
   * Whether a recipient may receive the notification: channel events require
   * current membership, direct-message events are participant-scoped by id.
   * @param recipientUid Uid of the notified user.
   * @param target Parsed conversation target of the activity.
   */
  private isReachable(recipientUid: string, target: NotificationTarget): boolean {
    if (target.channelId === null) return true;
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
