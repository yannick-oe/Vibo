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
import { UserDoc } from '../models/user.model';
import { emojiAsset, emojiName } from '../features/chat/emoji-catalog';
import { parseMentions } from '../features/chat/mention-parser';
import { NotificationToastEmoji } from './notification-toast.service';
import { channelMessagesPath, directMessagesPath } from './message.service';

const CHANNEL_MESSAGE_PATTERN = /^channels\/([^/]+)\/messages\/([^/]+?)(\/replies\/[^/]+)?$/;
const DM_MESSAGE_PATTERN = /^directMessages\/([^/]+)\/messages\/([^/]+?)(\/replies\/[^/]+)?$/;
const CHANNEL_CONVERSATION_PATTERN = /^channels\/([^/]+)$/;
const DM_CONVERSATION_PATTERN = /^directMessages\/([^/]+)$/;
const CHANNEL_KEY_PREFIX = 'channel:';
const DM_KEY_PREFIX = 'dm:';
const REPLY_VERB = 'geantwortet';
const INLINE_REPLY_VERB = 'auf deine Nachricht geantwortet';
const REACTION_VERB = 'reagiert';
const MENTION_VERB = 'dich erwähnt';
const REPLY_NOUN_PLURAL = 'neue Antworten';
const MENTION_NOUN_PLURAL = 'Erwähnungen';

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
  if (doc.channelId) return `${CHANNEL_KEY_PREFIX}${doc.channelId}`;
  return `${DM_KEY_PREFIX}${dmPartnerOf(doc.conversationId ?? '', me)}`;
}


/**
 * The conversation key of a sidebar entry's Firestore path, in the same
 * format as {@link conversationKeyOf}, so the unread badge can look up a
 * pending mention; null for an unrecognised path.
 * @param conversationPath Path `channels/{id}` or `directMessages/{id}`.
 * @param me Signed-in user's uid.
 */
export function conversationKeyOfPath(conversationPath: string, me: string): string | null {
  const channel = conversationPath.match(CHANNEL_CONVERSATION_PATTERN);
  if (channel) return `${CHANNEL_KEY_PREFIX}${channel[1]}`;
  const dm = conversationPath.match(DM_CONVERSATION_PATTERN);
  return dm ? `${DM_KEY_PREFIX}${dmPartnerOf(dm[1], me)}` : null;
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
 * The feed entries belonging to a coalesced group, so dismissing a bell row
 * deletes exactly the documents it represents.
 * @param entries Current feed entries.
 * @param group Group to expand back into its member entries.
 */
export function entriesOfGroup(entries: NotificationEntry[], group: NotificationGroup): NotificationEntry[] {
  return entries.filter(entry => groupKeyOf(entry) === group.key);
}


/**
 * The distinct uids @mentioned in a message text, resolved against the known
 * users by display name (the composer inserts names, not handles). Ambiguous
 * names resolve to every matching user so no mention is silently dropped.
 * @param text Sent message or reply text.
 * @param users All known users.
 */
export function resolveMentionedUids(text: string, users: UserDoc[]): string[] {
  const mentioned = new Set(
    parseMentions(text, users.map(user => user.name))
      .filter(part => part.isMention)
      .map(part => part.text.slice(1)),
  );
  return [...new Set(users.filter(user => mentioned.has(user.name)).map(user => user.uid))];
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
 * The German past participle of a notification kind, used in both the toast
 * action line and the grouped bell title. Inline replies ("Antworten") read
 * "auf deine Nachricht geantwortet"; thread replies read "geantwortet".
 * @param kind Notification kind.
 */
function kindVerb(kind: NotificationKind): string {
  if (kind === 'reaction') return REACTION_VERB;
  if (kind === 'mention') return MENTION_VERB;
  if (kind === 'reply') return INLINE_REPLY_VERB;
  return REPLY_VERB;
}


/**
 * The toast action line of a notification kind ("hat geantwortet" /
 * "hat reagiert" / "hat dich erwähnt"; a reaction emoji renders separately).
 * @param kind Notification kind.
 */
export function actionLabel(kind: NotificationKind): string {
  return `hat ${kindVerb(kind)}`;
}


/**
 * The German title of a grouped bell entry. Replies and mentions with more
 * than one unread event lead with the event count ("3 neue Antworten von
 * Gast"); reactions and single events keep the actor summary.
 * @param group Coalesced feed group.
 * @param actorName Display name of the newest actor.
 */
export function groupTitle(group: NotificationGroup, actorName: string): string {
  const kind = group.latest.kind;
  if (kind !== 'reaction' && group.count > 1) return countTitle(kind, group.count, actorName);
  return actorTitle(group, actorName);
}


/**
 * The count-led title for multiple replies/mentions from a group ("3 neue
 * Antworten von Gast", "2 Erwähnungen von Gast"). Thread and inline replies
 * share the "neue Antworten" noun; only mentions differ.
 * @param kind Notification kind (thread-reply, reply or mention).
 * @param count Number of unread events in the group.
 * @param actorName Display name of the newest actor.
 */
function countTitle(kind: NotificationKind, count: number, actorName: string): string {
  const noun = kind === 'mention' ? MENTION_NOUN_PLURAL : REPLY_NOUN_PLURAL;
  return `${count} ${noun} von ${actorName}`;
}


/**
 * The actor-summary title, naming the newest actor and counting the other
 * distinct actors ("Anna und 2 weitere Personen haben reagiert").
 * @param group Coalesced feed group.
 * @param actorName Display name of the newest actor.
 */
function actorTitle(group: NotificationGroup, actorName: string): string {
  const verb = kindVerb(group.latest.kind);
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
