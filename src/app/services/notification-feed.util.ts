/**
 * @file Pure helpers for activity notifications: parsing a message path into
 * the stored notification target, rebuilding paths/routes/keys on the
 * recipient side, coalescing the feed into grouped entries and building the
 * German display strings. No Angular or Firestore service access — kept apart
 * so the fan-out and feed services stay focused.
 */
import { Timestamp } from '@angular/fire/firestore';

import {
  NotificationDoc,
  NotificationEntry,
  NotificationKind,
} from '../models/notification.model';
import { emojiAsset, emojiName } from '../features/chat/emoji-catalog';
import { NotificationToastEmoji } from './notification-toast.service';
import { channelMessagesPath, directMessagesPath } from './message.service';

const CHANNEL_MESSAGE_PATTERN = /^channels\/([^/]+)\/messages\/([^/]+?)(\/replies\/[^/]+)?$/;
const DM_MESSAGE_PATTERN = /^directMessages\/([^/]+)\/messages\/([^/]+?)(\/replies\/[^/]+)?$/;
const REPLY_VERB = 'geantwortet';
const REACTION_VERB = 'reagiert';

/** Conversation reference and main-stream message a notification points at. */
export interface NotificationTarget {
  readonly channelId: string | null;
  readonly conversationId: string | null;
  readonly messageId: string;
  readonly inThread: boolean;
}

/** Coalesced feed entries targeting the same message with the same kind. */
export interface NotificationGroup {
  readonly key: string;
  readonly latest: NotificationEntry;
  readonly actorUids: string[];
  readonly count: number;
}


/**
 * Parses a message or reply document path into the notification target: the
 * conversation reference, the MAIN-stream message id (the parent message for
 * reply paths) and whether the path points inside a thread.
 * @param messagePath Firestore path of the message or reply document.
 */
export function targetOfMessagePath(messagePath: string): NotificationTarget | null {
  const channel = messagePath.match(CHANNEL_MESSAGE_PATTERN);
  if (channel) {
    return { channelId: channel[1], conversationId: null, messageId: channel[2], inThread: Boolean(channel[3]) };
  }
  const dm = messagePath.match(DM_MESSAGE_PATTERN);
  if (!dm) return null;
  return { channelId: null, conversationId: dm[1], messageId: dm[2], inThread: Boolean(dm[3]) };
}


/**
 * The conversation-reference fields stored on a notification document:
 * exactly one of channelId/conversationId, mirroring the rules shape.
 * @param target Parsed notification target.
 */
export function targetFieldsOf(target: NotificationTarget): Partial<NotificationDoc> {
  return target.channelId !== null
    ? { channelId: target.channelId }
    : { conversationId: target.conversationId ?? '' };
}


/**
 * Rebuilds the Firestore path of the notification's main-stream message
 * (the thread root for thread events).
 * @param doc Notification document.
 */
export function rootMessagePath(doc: NotificationDoc): string {
  const collectionPath = doc.channelId
    ? channelMessagesPath(doc.channelId)
    : directMessagesPath(doc.conversationId ?? '');
  return `${collectionPath}/${doc.messageId}`;
}


/**
 * The partner uid of a direct conversation from the recipient's perspective;
 * the self conversation resolves to the own uid.
 * @param conversationId Deterministic conversation id (uids joined with "_").
 * @param me Recipient's uid.
 */
export function dmPartnerOf(conversationId: string, me: string): string {
  return conversationId.split('_').find(uid => uid !== me) ?? me;
}


/**
 * The conversation key of a notification in the same format the open-key
 * parser derives from the router URL, used to suppress and auto-clear
 * notifications of the currently open conversation.
 * @param doc Notification document.
 * @param me Recipient's uid.
 */
export function conversationKeyOf(doc: NotificationDoc, me: string): string {
  if (doc.channelId) return `channel:${doc.channelId}`;
  return `dm:${dmPartnerOf(doc.conversationId ?? '', me)}`;
}


/**
 * Router commands of the conversation a notification points at.
 * @param doc Notification document.
 * @param me Recipient's uid.
 */
export function routeOf(doc: NotificationDoc, me: string): string[] {
  if (doc.channelId) return ['/app/channel', doc.channelId];
  return ['/app/dm', dmPartnerOf(doc.conversationId ?? '', me)];
}


/**
 * Milliseconds of a notification's creation time; the recipient only ever
 * reads server-resolved timestamps, anything else counts as history.
 * @param doc Notification document.
 */
export function notificationMillis(doc: NotificationDoc): number {
  return doc.createdAt instanceof Timestamp ? doc.createdAt.toMillis() : 0;
}


/**
 * Coalesces the newest-first feed into one group per (kind, message): the
 * newest entry represents the group; rapid reactions on the same message
 * collapse into a single row with distinct actors counted.
 * @param entries Feed entries ordered newest first.
 */
export function groupNotifications(entries: NotificationEntry[]): NotificationGroup[] {
  const groups = new Map<string, { latest: NotificationEntry; actorUids: string[]; count: number }>();
  for (const entry of entries) {
    const key = groupKeyOf(entry);
    const group = groups.get(key);
    if (!group) groups.set(key, { latest: entry, actorUids: [entry.actorUid], count: 1 });
    else registerMember(group, entry);
  }
  return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
}


/**
 * Counts an additional entry into an existing group.
 * @param group Mutable group accumulator.
 * @param entry Older entry belonging to the same group.
 */
function registerMember(group: { actorUids: string[]; count: number }, entry: NotificationEntry): void {
  group.count += 1;
  if (!group.actorUids.includes(entry.actorUid)) group.actorUids.push(entry.actorUid);
}


/**
 * The coalescing key of a feed entry: kind, conversation and target message.
 * @param entry Feed entry.
 */
function groupKeyOf(entry: NotificationEntry): string {
  return `${entry.kind}:${entry.channelId ?? entry.conversationId}:${entry.messageId}`;
}


/**
 * The toast action line of a notification kind ("hat geantwortet" /
 * "hat reagiert"; the reaction emoji is rendered separately).
 * @param kind Notification kind.
 */
export function actionLabel(kind: NotificationKind): string {
  return kind === 'reaction' ? `hat ${REACTION_VERB}` : `hat ${REPLY_VERB}`;
}


/**
 * The German title of a grouped bell entry, naming the newest actor and
 * counting the other distinct actors ("Anna und 2 weitere Personen haben…").
 * @param group Coalesced feed group.
 * @param actorName Display name of the newest actor.
 */
export function groupTitle(group: NotificationGroup, actorName: string): string {
  const verb = group.latest.kind === 'reaction' ? REACTION_VERB : REPLY_VERB;
  const others = group.actorUids.length - 1;
  if (others === 0) return `${actorName} hat ${verb}`;
  if (others === 1) return `${actorName} und 1 weitere Person haben ${verb}`;
  return `${actorName} und ${others} weitere Personen haben ${verb}`;
}


/**
 * Resolves a reaction emoji into its toast/bell rendering metadata: the
 * Twemoji asset and German name, with the raw character as fallback.
 * @param char Unicode emoji character.
 */
export function toastEmojiOf(char: string): NotificationToastEmoji {
  return { char, asset: emojiAsset(char), name: emojiName(char) };
}
